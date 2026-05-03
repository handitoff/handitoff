import type { Route } from "./+types/session";
import {
  deriveAesGcmKey,
  exportEcdhPublicKey,
  generateEcdhKeyPair,
  importEcdhPublicKey,
  type EcdhKeyPair,
} from "@handitoff/crypto";
import { BrowserTransferController, type TransferProgressSnapshot } from "@handitoff/transfer";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AppShell } from "../components/app-shell";
import {
  initialClientSessionState,
  reduceClientSessionState,
  type ClientSessionState,
  type TransferItem,
} from "../lib/session-store";
import { loadPublicRuntimeConfig } from "../lib/runtime-config";
import { seoMeta } from "../lib/seo";
import { HanditoffWebSocketClient } from "../lib/websocket-client";
import { WebRtcPeer, type WebRtcPeerEvent } from "../lib/webrtc-peer";

type StoredSessionContext = {
  sessionId: string;
  publicCode: string;
  deviceId: string;
  deviceLabel: string;
  peerDeviceId: string;
  peerDeviceLabel: string;
  role: "host" | "guest";
};

export function meta({ params }: Route.MetaArgs) {
  return seoMeta({
    title: `Session ${params.code} - handitoff.io`,
    description: "Temporary handitoff.io browser file handoff session.",
    path: `/s/${params.code}`,
    noIndex: true,
  });
}

export default function Session({ params }: Route.ComponentProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const socketRef = useRef<HanditoffWebSocketClient | undefined>(undefined);
  const peerRef = useRef<WebRtcPeer | undefined>(undefined);
  const transferRef = useRef<BrowserTransferController | undefined>(undefined);
  const keyPairRef = useRef<EcdhKeyPair | undefined>(undefined);
  const aesKeyRef = useRef<CryptoKey | undefined>(undefined);
  const objectUrlsRef = useRef<string[]>([]);
  const localPublicKeyRef = useRef<JsonWebKey | undefined>(undefined);
  const pendingPeerPublicKeyRef = useRef<JsonWebKey | undefined>(undefined);
  const cryptoFailureMessageRef = useRef<string | undefined>(undefined);
  const stateRef = useRef<ClientSessionState>(initialClientSessionState);
  const configRef = useRef(loadPublicRuntimeConfig());
  const [state, dispatch] = useReducer(reduceClientSessionState, initialClientSessionState);
  const [chosenFiles, setChosenFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [lastDataChannelMessage, setLastDataChannelMessage] = useState("Waiting");
  const [retryKey, setRetryKey] = useState(0);
  const [networkType, setNetworkType] = useState<"local" | "relay" | "unknown">("unknown");

  stateRef.current = state;

  const teardownPeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = undefined;
    transferRef.current = undefined;
    keyPairRef.current = undefined;
    aesKeyRef.current = undefined;
    localPublicKeyRef.current = undefined;
    pendingPeerPublicKeyRef.current = undefined;
    cryptoFailureMessageRef.current = undefined;
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current = [];
  }, []);

  const sendSignal = useCallback((message: Parameters<HanditoffWebSocketClient["send"]>[0]) => {
    socketRef.current?.send(message);
  }, []);

  const sendPeerControl = useCallback((message: unknown) => {
    try {
      peerRef.current?.sendJson(message);
    } catch {
      // The control message will be retried on DataChannel open when relevant.
    }
  }, []);

  const sendLocalPublicKey = useCallback(
    async (keyPair: EcdhKeyPair) => {
      const current = stateRef.current;
      const publicKey = await exportEcdhPublicKey(keyPair.publicKey);
      localPublicKeyRef.current = publicKey;

      if (current.sessionId !== undefined && current.deviceId !== undefined) {
        sendSignal({
          type: "crypto:public-key",
          sessionId: current.sessionId,
          fromDeviceId: current.deviceId,
          publicKey,
        });
      }
      sendPeerControl({ type: "crypto:public-key", publicKey });
    },
    [sendPeerControl, sendSignal],
  );

  const snapshotToTransferItem = useCallback((snapshot: TransferProgressSnapshot) => {
    dispatch({
      type: "transfer:upsert",
      item: {
        id: `${snapshot.transferId}:${snapshot.fileId ?? "transfer"}`,
        name: snapshot.name ?? "Transfer",
        size: snapshot.totalBytes,
        progress: snapshot.progress,
        direction: snapshot.direction,
        ...(snapshot.fileId === undefined ? {} : { fileId: snapshot.fileId }),
        status: snapshot.status,
        ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
        ...(snapshot.downloadUrl === undefined ? {} : { downloadUrl: snapshot.downloadUrl }),
      },
    });
  }, []);

  const ensureTransferController = useCallback(() => {
    if (transferRef.current !== undefined || aesKeyRef.current === undefined) {
      return transferRef.current;
    }
    let channel: RTCDataChannel;
    try {
      if (peerRef.current === undefined) {
        return undefined;
      }
      channel = peerRef.current.getOpenDataChannel();
    } catch {
      return undefined;
    }
    transferRef.current = new BrowserTransferController({
      channel,
      key: aesKeyRef.current,
      createObjectUrl: (blob) => {
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
        return url;
      },
      events: {
        // Product decision for MVP: an approved peer's file offer is accepted automatically.
        onOffer: () => true,
        onProgress: snapshotToTransferItem,
        onComplete: snapshotToTransferItem,
        onError: snapshotToTransferItem,
      },
    });
    return transferRef.current;
  }, [snapshotToTransferItem]);

  const completeCryptoExchange = useCallback(
    async (peerPublicKey: JsonWebKey) => {
      const keyPair = keyPairRef.current;
      if (keyPair === undefined) {
        pendingPeerPublicKeyRef.current = peerPublicKey;
        return;
      }

      const importedPeerPublicKey = await importEcdhPublicKey(peerPublicKey);
      aesKeyRef.current = await deriveAesGcmKey(keyPair.privateKey, importedPeerPublicKey);
      pendingPeerPublicKeyRef.current = undefined;
      dispatch({ type: "crypto:ready" });
      setLastDataChannelMessage("Secure");
      ensureTransferController();
    },
    [ensureTransferController],
  );

  const startCryptoExchange = useCallback(async () => {
    keyPairRef.current = undefined;
    aesKeyRef.current = undefined;
    localPublicKeyRef.current = undefined;
    pendingPeerPublicKeyRef.current = undefined;
    dispatch({ type: "crypto:generating" });

    const unavailableMessage = getCryptoUnavailableMessage();
    if (unavailableMessage !== undefined) {
      cryptoFailureMessageRef.current = unavailableMessage;
      sendPeerControl({ type: "crypto:error", message: unavailableMessage });
      throw new Error(unavailableMessage);
    }

    const keyPair = await generateEcdhKeyPair();
    keyPairRef.current = keyPair;
    dispatch({ type: "crypto:exchanging" });
    await sendLocalPublicKey(keyPair);

    const pendingPeerPublicKey = pendingPeerPublicKeyRef.current;
    if (pendingPeerPublicKey !== undefined) {
      await completeCryptoExchange(pendingPeerPublicKey);
    }
  }, [completeCryptoExchange, sendLocalPublicKey, sendPeerControl]);

  const handlePeerEvent = useCallback(
    (event: WebRtcPeerEvent) => {
      const current = stateRef.current;
      if (
        event.type === "local-description" &&
        current.sessionId !== undefined &&
        current.deviceId !== undefined
      ) {
        sendSignal({
          type: event.description.type === "offer" ? "webrtc:offer" : "webrtc:answer",
          sessionId: current.sessionId,
          fromDeviceId: current.deviceId,
          sdp: event.description,
        });
        return;
      }
      if (
        event.type === "ice-candidate" &&
        current.sessionId !== undefined &&
        current.deviceId !== undefined
      ) {
        sendSignal({
          type: "webrtc:ice-candidate",
          sessionId: current.sessionId,
          fromDeviceId: current.deviceId,
          candidate: event.candidate,
        });
        return;
      }
      if (
        event.type === "connection-state" &&
        (event.state === "connected" || event.state === "completed")
      ) {
        dispatch({ type: "webrtc:connected" });
        return;
      }
      if (event.type === "data-channel-open") {
        dispatch({ type: "data-channel:open" });
        setLastDataChannelMessage("Securing");
        ensureTransferController();
        if (cryptoFailureMessageRef.current !== undefined) {
          sendPeerControl({
            type: "crypto:error",
            message: cryptoFailureMessageRef.current,
          });
        }
        if (localPublicKeyRef.current !== undefined) {
          sendPeerControl({
            type: "crypto:public-key",
            publicKey: localPublicKeyRef.current,
          });
        }
        sendPeerControl({ type: "connection:ping", sentAt: Date.now() });
        return;
      }
      if (event.type === "data-channel-close") {
        if (hasActiveTransfer(stateRef.current.transfer)) {
          dispatch({
            type: "data-channel:failed",
            message:
              "The file channel closed during transfer. This usually means the paired tab closed, the device locked or slept, or one side changed networks.",
          });
          return;
        }
        dispatch({ type: "data-channel:closed" });
        return;
      }
      if (event.type === "data-channel-error") {
        dispatch({ type: "data-channel:failed", message: event.message });
        return;
      }
      if (event.type === "data-channel-message") {
        if (typeof event.data === "string") {
          const parsed = parseDataChannelControlMessage(event.data);
          if (parsed?.type === "connection:ping") {
            sendPeerControl({ type: "connection:pong", receivedAt: Date.now() });
            setLastDataChannelMessage("Ready");
            return;
          }
          if (parsed?.type === "connection:pong") {
            setLastDataChannelMessage("Ready");
            return;
          }
          if (parsed?.type === "crypto:error") {
            dispatch({
              type: "crypto:failed",
              message:
                parsed.message ??
                "The paired browser cannot start encrypted transfer. Open both devices over HTTPS or localhost.",
            });
            return;
          }
          if (parsed?.type === "crypto:public-key" && parsed.publicKey !== undefined) {
            void completeCryptoExchange(parsed.publicKey).catch((error: unknown) => {
              const errorMessage = getCryptoErrorMessage(error);
              cryptoFailureMessageRef.current = errorMessage;
              sendPeerControl({ type: "crypto:error", message: errorMessage });
              dispatch({
                type: "crypto:failed",
                message: errorMessage,
              });
            });
            return;
          }
        }
        void transferRef.current?.handleData(event.data).catch((error: unknown) => {
          dispatch({
            type: "data-channel:failed",
            message: getTransferErrorMessage(error),
          });
        });
        setLastDataChannelMessage("Transfer update");
        return;
      }
      if (event.type === "network-type") {
        setNetworkType(event.networkType);
        return;
      }
      if (event.type === "failed") {
        if (stateRef.current.dataChannel === "open" && stateRef.current.crypto === "ready") {
          return;
        }
        dispatch({ type: "webrtc:failed", message: event.message });
      }
    },
    [ensureTransferController, sendPeerControl, sendSignal],
  );

  const createPeer = useCallback(
    (role: "host" | "guest") => {
      teardownPeer();
      dispatch({ type: "webrtc:negotiating" });
      dispatch({ type: "data-channel:connecting" });
      peerRef.current = new WebRtcPeer({
        role,
        iceServers: configRef.current.iceServers,
        onEvent: handlePeerEvent,
      });
      void startCryptoExchange().catch((error: unknown) => {
        const message = getCryptoErrorMessage(error);
        cryptoFailureMessageRef.current = message;
        sendPeerControl({ type: "crypto:error", message });
        dispatch({
          type: "crypto:failed",
          message,
        });
      });
    },
    [handlePeerEvent, sendPeerControl, startCryptoExchange, teardownPeer],
  );

  useEffect(() => {
    const stored = readStoredSessionContext(params.code);
    if (stored === undefined) {
      navigate("/");
      return;
    }

    const controller = new AbortController();
    dispatch({ type: "session:resume-start", ...stored });
    dispatch({ type: "socket:connecting" });

    void fetchConfig(controller.signal)
      .then((config) => {
        if (controller.signal.aborted) {
          return;
        }
        configRef.current = config;
        const socket = new HanditoffWebSocketClient(config.wsUrl);
        socketRef.current = socket;

        socket.onStatus((status) => {
          dispatch(
            status === "connected" ? { type: "socket:connected" } : { type: "socket:disconnected" },
          );
          if (status === "connected") {
            socket.send({
              type: "session:resume",
              sessionId: stored.sessionId,
              deviceId: stored.deviceId,
            });
          }
        });

        socket.onMessage((message) => {
          if (message.type === "session:resumed") {
            dispatch({
              type: "session:paired",
              sessionId: message.sessionId,
              peerDeviceId: message.peerDeviceId,
              peerDeviceLabel: message.peerDeviceLabel,
              role: message.role,
            });
            createPeer(message.role);
            return;
          }
          if (message.type === "peer:connected") {
            const current = stateRef.current;
            if (current.role === "host") {
              void peerRef.current?.startOffer().catch((error: unknown) => {
                dispatch({
                  type: "webrtc:failed",
                  message:
                    error instanceof Error ? error.message : "Could not start WebRTC negotiation.",
                });
              });
            }
            return;
          }
          if (message.type === "webrtc:offer") {
            void peerRef.current?.acceptOffer(message.sdp).catch((error: unknown) => {
              dispatch({
                type: "webrtc:failed",
                message: error instanceof Error ? error.message : "Could not accept WebRTC offer.",
              });
            });
            return;
          }
          if (message.type === "webrtc:answer") {
            void peerRef.current?.acceptAnswer(message.sdp).catch((error: unknown) => {
              dispatch({
                type: "webrtc:failed",
                message: error instanceof Error ? error.message : "Could not accept WebRTC answer.",
              });
            });
            return;
          }
          if (message.type === "webrtc:ice-candidate") {
            void peerRef.current?.addIceCandidate(message.candidate).catch((error: unknown) => {
              dispatch({
                type: "webrtc:failed",
                message: error instanceof Error ? error.message : "Could not add ICE candidate.",
              });
            });
            return;
          }
          if (message.type === "crypto:public-key") {
            void completeCryptoExchange(message.publicKey).catch((error: unknown) => {
              const errorMessage = getCryptoErrorMessage(error);
              cryptoFailureMessageRef.current = errorMessage;
              sendPeerControl({ type: "crypto:error", message: errorMessage });
              dispatch({
                type: "crypto:failed",
                message: errorMessage,
              });
            });
            return;
          }
          if (message.type === "peer:disconnected") {
            if (stateRef.current.dataChannel !== "open") {
              return;
            }
            teardownPeer();
            dispatch({ type: "webrtc:failed", message: "The paired device disconnected." });
            return;
          }
          if (message.type === "session:expired") {
            teardownPeer();
            dispatch({ type: "session:expired" });
            return;
          }
          if (message.type === "session:ended") {
            teardownPeer();
            clearStoredSessionContext();
            dispatch({ type: "session:ended" });
            return;
          }
          if (message.type === "error") {
            dispatch({ type: "webrtc:failed", message: message.message });
          }
        });

        socket.connect();

        const presenceInterval = window.setInterval(() => {
          if (socketRef.current !== socket) {
            window.clearInterval(presenceInterval);
            return;
          }
          try {
            socket.send({
              type: "presence:ping",
              sessionId: stored.sessionId,
              deviceId: stored.deviceId,
            });
          } catch {
            // The status listener owns user-facing reconnect state.
          }
        }, 10_000);

        controller.signal.addEventListener("abort", () => window.clearInterval(presenceInterval), {
          once: true,
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          dispatch({
            type: "webrtc:failed",
            message: error instanceof Error ? error.message : "Could not reconnect signaling.",
          });
        }
      });

    return () => {
      controller.abort();
      teardownPeer();
      socketRef.current?.close();
      socketRef.current = undefined;
    };
  }, [createPeer, navigate, params.code, retryKey, sendPeerControl, teardownPeer]);

  const chooseFiles = () => inputRef.current?.click();
  const readFiles = (files: FileList | null) => {
    const selected = files === null ? [] : Array.from(files);
    setChosenFiles(selected);
    if (selected.length === 0) {
      return;
    }
    const controller = ensureTransferController();
    if (controller === undefined) {
      dispatch({
        type: "data-channel:failed",
        message: "Secure transfer is not ready yet.",
      });
      return;
    }
    try {
      controller.sendFiles(selected);
    } catch (error) {
      dispatch({
        type: "data-channel:failed",
        message: error instanceof Error ? error.message : "Could not start file transfer.",
      });
    }
  };
  const cancelTransfer = (id: string, fileId: string | undefined) => {
    transferRef.current?.cancelTransfer(id.split(":")[0] ?? id, fileId);
  };
  const retryTransfer = (id: string) => {
    void transferRef.current?.retryTransfer(id.split(":")[0] ?? id).catch((error: unknown) => {
      dispatch({
        type: "data-channel:failed",
        message: error instanceof Error ? error.message : "Could not retry transfer.",
      });
    });
  };
  const retryConnection = () => setRetryKey((key) => key + 1);
  const endSession = () => {
    if (state.sessionId !== undefined && state.deviceId !== undefined) {
      socketRef.current?.send({
        type: "session:end",
        sessionId: state.sessionId,
        deviceId: state.deviceId,
      });
    }
    teardownPeer();
    clearStoredSessionContext();
    navigate("/");
  };

  const canSendFiles = state.dataChannel === "open" && state.crypto === "ready";
  const hasChannelIssue =
    state.dataChannel === "failed" ||
    state.crypto === "failed" ||
    (state.webrtc === "failed" && state.dataChannel !== "open");
  const connectionLabel = getConnectionLabel(state, canSendFiles, hasChannelIssue);
  const channelFootnote = getChannelFootnote(state, canSendFiles, hasChannelIssue);
  const peerLabel = state.peerDeviceLabel ?? "Paired device";
  const outgoingTransfers = state.transfer.outgoing;
  const incomingTransfers = state.transfer.incoming;

  return (
    <AppShell>
      <main
        className="xfer-stage"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) {
            setDragActive(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          readFiles(event.dataTransfer.files);
        }}
      >
        {/* SEND — left on desktop, top on mobile */}
        <section className="xfer-panel">
          <div className="xfer-panel-header">
            <span className="xfer-panel-dir">↑ Send</span>
            <span className="xfer-panel-peer">{peerLabel}</span>
          </div>

          <div className="xfer-send-body">
            <h1 className="xfer-send-title">
              Drop
              <br />
              anything.
            </h1>
            <p className="xfer-send-sub">
              {hasChannelIssue
                ? getChannelIssueMessage(state)
                : "Files land on the paired device. Photos, docs, archives — anything."}
            </p>
            <div className="xfer-drop-strip" aria-label="File drop area">
              <span>{dragActive ? "Release to send" : "Drop files here"}</span>
              <span className="xfer-drop-code">{params.code}</span>
            </div>
            <div className="xfer-send-actions">
              <input
                ref={inputRef}
                type="file"
                multiple
                className="visually-hidden"
                onChange={(event) => readFiles(event.target.files)}
                aria-label="Choose files to send"
                disabled={!canSendFiles}
              />
              <button
                className="button"
                type="button"
                onClick={chooseFiles}
                disabled={!canSendFiles}
              >
                {canSendFiles
                  ? "Choose files"
                  : state.dataChannel === "open"
                    ? "Securing…"
                    : "Connecting…"}
              </button>
              {hasChannelIssue ? (
                <button className="button secondary" type="button" onClick={retryConnection}>
                  Retry
                </button>
              ) : null}
              <button className="button secondary" type="button" onClick={endSession}>
                End session
              </button>
            </div>
          </div>

          <div className="xfer-list-area">
            <div className="xfer-list-header">
              <span>Outbound</span>
              {outgoingTransfers.length > 0 ? (
                <span>
                  {outgoingTransfers.length} {outgoingTransfers.length === 1 ? "file" : "files"}
                </span>
              ) : null}
            </div>
            <div className="xfer-scroll">
              {outgoingTransfers.length === 0 ? (
                <div className="xfer-empty">
                  {chosenFiles.length > 0
                    ? `${chosenFiles.length} ${chosenFiles.length === 1 ? "file" : "files"} queued`
                    : "No files sent yet"}
                </div>
              ) : (
                outgoingTransfers.map((item, i) => (
                  <XferRow
                    key={item.id}
                    item={item}
                    index={i + 1}
                    onCancel={cancelTransfer}
                    onRetry={retryTransfer}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        <div className="xfer-hairline" />

        {/* RECEIVE — right on desktop, bottom on mobile */}
        <aside className="xfer-panel xfer-panel--receive">
          <div className="xfer-panel-header">
            <span className="xfer-panel-dir">↓ Receive</span>
            <span className="xfer-panel-peer">{peerLabel}</span>
          </div>

          <div className="xfer-device-row">
            <DeviceIcon label={peerLabel} ready={canSendFiles} />
            <div className="xfer-device-info">
              <span className="xfer-device-name">{peerLabel}</span>
              <span className="xfer-device-status">{connectionLabel}</span>
            </div>
          </div>

          <div className="xfer-list-area">
            <div className="xfer-list-header">
              <span>Inbound</span>
              {incomingTransfers.length > 0 ? (
                <span>
                  {incomingTransfers.length} {incomingTransfers.length === 1 ? "file" : "files"}
                </span>
              ) : null}
            </div>
            <div className="xfer-scroll">
              {incomingTransfers.length === 0 ? (
                <div className="xfer-empty">{lastDataChannelMessage}</div>
              ) : (
                incomingTransfers.map((item, i) => (
                  <XferRow
                    key={item.id}
                    item={item}
                    index={i + 1}
                    onCancel={cancelTransfer}
                    onRetry={retryTransfer}
                  />
                ))
              )}
            </div>
          </div>

          <div className="xfer-panel-footer">
            <span>{channelFootnote}</span>
            {networkType !== "unknown" ? (
              <span className={`xfer-net-badge xfer-net-badge--${networkType}`}>
                {networkType === "local" ? "◉ Direct" : "◌ Relay"}
              </span>
            ) : null}
          </div>
        </aside>
      </main>
    </AppShell>
  );
}

function DeviceIcon({ label, ready }: { label: string; ready: boolean }) {
  const l = label.toLowerCase();
  const isTablet = l.includes("ipad");
  const isLaptop = l.includes("macbook") || (l.includes("mac") && !l.includes("android"));
  const isDesktop = l.includes("pc") || l.includes("windows") || l.includes("linux");

  const stroke = "#0a0a0a";
  const sw = "1.5";
  const common = {
    fill: "none",
    stroke,
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (isLaptop) {
    return (
      <svg className="xfer-device-svg" viewBox="0 0 56 56" aria-hidden="true" {...common}>
        {/* screen */}
        <rect x="4" y="2" width="48" height="34" rx="3" />
        {/* camera dot */}
        <circle cx="28" cy="7" r="1.5" fill={stroke} stroke="none" />
        {/* status in screen */}
        <text
          x="28"
          y="25"
          textAnchor="middle"
          fontSize="12"
          fill={stroke}
          stroke="none"
          fontFamily="system-ui"
        >
          {ready ? "✓" : "…"}
        </text>
        {/* hinge */}
        <line x1="0" y1="38" x2="56" y2="38" />
        {/* base */}
        <rect x="0" y="38" width="56" height="14" rx="2" />
        {/* trackpad */}
        <rect x="20" y="42" width="16" height="8" rx="2" />
      </svg>
    );
  }

  if (isDesktop) {
    return (
      <svg className="xfer-device-svg" viewBox="0 0 56 56" aria-hidden="true" {...common}>
        {/* monitor */}
        <rect x="2" y="2" width="52" height="36" rx="3" />
        {/* status */}
        <text
          x="28"
          y="24"
          textAnchor="middle"
          fontSize="12"
          fill={stroke}
          stroke="none"
          fontFamily="system-ui"
        >
          {ready ? "✓" : "…"}
        </text>
        {/* stand neck */}
        <line x1="28" y1="38" x2="28" y2="48" />
        {/* stand base */}
        <path d="M14 48 Q28 44 42 48" strokeWidth={sw} />
        <line x1="14" y1="48" x2="42" y2="48" />
      </svg>
    );
  }

  if (isTablet) {
    return (
      <svg
        className="xfer-device-svg xfer-device-svg--tall"
        viewBox="0 0 44 68"
        aria-hidden="true"
        {...common}
      >
        {/* body */}
        <rect x="3" y="2" width="38" height="64" rx="5" />
        {/* camera */}
        <circle cx="22" cy="8" r="2" fill={stroke} stroke="none" />
        {/* home button */}
        <circle cx="22" cy="60" r="3" />
        {/* status */}
        <text
          x="22"
          y="38"
          textAnchor="middle"
          fontSize="11"
          fill={stroke}
          stroke="none"
          fontFamily="system-ui"
        >
          {ready ? "✓" : "…"}
        </text>
      </svg>
    );
  }

  // Phone (iPhone, Android, Unknown)
  return (
    <svg
      className="xfer-device-svg xfer-device-svg--tall"
      viewBox="0 0 36 68"
      aria-hidden="true"
      {...common}
    >
      {/* body */}
      <rect x="2" y="2" width="32" height="64" rx="7" />
      {/* speaker */}
      <rect x="12" y="9" width="12" height="4" rx="2" fill={stroke} stroke="none" />
      {/* home bar */}
      <rect x="11" y="57" width="14" height="3" rx="1.5" fill={stroke} stroke="none" />
      {/* status */}
      <text
        x="18"
        y="38"
        textAnchor="middle"
        fontSize="11"
        fill={stroke}
        stroke="none"
        fontFamily="system-ui"
      >
        {ready ? "✓" : "…"}
      </text>
    </svg>
  );
}

function XferRow({
  item,
  index,
  onCancel,
  onRetry,
}: {
  item: TransferItem;
  index: number;
  onCancel: (id: string, fileId: string | undefined) => void;
  onRetry: (id: string) => void;
}) {
  const pct = Math.round(item.progress * 100);
  const done = item.status === "complete";
  const failed = item.status === "failed" || item.status === "rejected";
  const canceled = item.status === "canceled";
  const active = !done && !failed && !canceled;
  const rowTitle = item.error === undefined ? item.name : `${item.name}: ${item.error}`;

  return (
    <div className="xfer-row">
      <div className="xfer-row-fill" style={{ width: `${pct}%` }} />
      <span className="xfer-row-index">{String(index).padStart(2, "0")}</span>
      <span className="xfer-row-name" title={rowTitle}>
        <span>{item.name}</span>
        {failed && item.error !== undefined ? (
          <span className="xfer-row-error">{item.error}</span>
        ) : null}
      </span>
      <span className="xfer-row-meta">{formatBytes(item.size)}</span>
      <span className="xfer-row-status">
        {done ? "✓" : failed ? "✗" : canceled ? "—" : `${pct}%`}
      </span>
      <div className="xfer-row-actions">
        {done && item.downloadUrl !== undefined ? (
          <a className="xfer-action" href={item.downloadUrl} download={item.name}>
            Save
          </a>
        ) : null}
        {failed ? (
          <button className="xfer-action" type="button" onClick={() => onRetry(item.id)}>
            Retry
          </button>
        ) : null}
        {active ? (
          <button
            className="xfer-action xfer-action--cancel"
            type="button"
            onClick={() => onCancel(item.id, item.fileId)}
            aria-label="Cancel"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getConnectionLabel(
  state: ClientSessionState,
  canSendFiles: boolean,
  hasChannelIssue: boolean,
): string {
  if (canSendFiles) {
    return "Secure transfer ready";
  }
  if (hasChannelIssue) {
    return "Connection needs retry";
  }
  if (state.dataChannel === "open") {
    return "Securing transfer";
  }
  return "Opening direct connection";
}

function getChannelFootnote(
  state: ClientSessionState,
  canSendFiles: boolean,
  hasChannelIssue: boolean,
): string {
  if (canSendFiles) {
    return "Files move directly between these browsers.";
  }
  if (hasChannelIssue) {
    return state.error ?? "The direct browser connection stopped.";
  }
  if (state.websocket !== "connected") {
    return "Reconnecting pairing channel.";
  }
  return "Preparing secure transfer.";
}

function getChannelIssueMessage(state: ClientSessionState): string {
  return state.error ?? "The direct browser connection stopped. Retry to reconnect.";
}

function getTransferErrorMessage(error: unknown): string {
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "OperationError"
  ) {
    return "Could not decrypt a file chunk. The secure session keys did not match or the data was corrupted.";
  }
  if (error instanceof Error) {
    if (/without a chunk header/i.test(error.message)) {
      return "Received file data out of sequence. Retry the transfer.";
    }
    if (/out of order|wrong offset/i.test(error.message)) {
      return "Received file chunks out of order. Retry the transfer.";
    }
    if (/integrity verification/i.test(error.message)) {
      return "The received file failed integrity verification. Retry the transfer.";
    }
    return error.message;
  }
  return "Transfer failed while reading data from the paired browser.";
}

function hasActiveTransfer(transfer: ClientSessionState["transfer"]): boolean {
  return [...transfer.outgoing, ...transfer.incoming].some((item) => {
    return (
      item.status !== "complete" &&
      item.status !== "failed" &&
      item.status !== "rejected" &&
      item.status !== "canceled"
    );
  });
}

async function fetchConfig(signal: AbortSignal) {
  const fallback = loadPublicRuntimeConfig();
  const response = await fetch(`${fallback.apiUrl}/api/config`, { signal });
  if (!response.ok) {
    return fallback;
  }
  return loadPublicRuntimeConfig(
    (await response.json()) as Partial<ReturnType<typeof loadPublicRuntimeConfig>>,
  );
}

function readStoredSessionContext(publicCode: string): StoredSessionContext | undefined {
  const normalizedCode = publicCode.toUpperCase();
  const sessionId = window.sessionStorage.getItem("handitoff.sessionId");
  const deviceId = window.sessionStorage.getItem("handitoff.deviceId");
  const deviceLabel = window.sessionStorage.getItem("handitoff.deviceLabel");
  const peerDeviceId = window.sessionStorage.getItem("handitoff.peerDeviceId");
  const peerDeviceLabel = window.sessionStorage.getItem("handitoff.connectedPeerLabel");
  const connectedCode = window.sessionStorage.getItem("handitoff.connectedCode");
  const role = window.sessionStorage.getItem("handitoff.role");

  if (
    sessionId === null ||
    deviceId === null ||
    deviceLabel === null ||
    peerDeviceId === null ||
    peerDeviceLabel === null ||
    connectedCode !== normalizedCode ||
    (role !== "host" && role !== "guest")
  ) {
    return undefined;
  }

  return {
    sessionId,
    publicCode: normalizedCode,
    deviceId,
    deviceLabel,
    peerDeviceId,
    peerDeviceLabel,
    role,
  };
}

function clearStoredSessionContext(): void {
  for (const key of [
    "handitoff.sessionId",
    "handitoff.deviceId",
    "handitoff.deviceLabel",
    "handitoff.peerDeviceId",
    "handitoff.connectedPeerLabel",
    "handitoff.connectedCode",
    "handitoff.role",
  ]) {
    window.sessionStorage.removeItem(key);
  }
}

function parseDataChannelControlMessage(
  value: string,
): { type: string; message?: string; publicKey?: JsonWebKey } | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      typeof parsed.type === "string"
    ) {
      return {
        type: parsed.type,
        ...("message" in parsed && typeof parsed.message === "string"
          ? { message: parsed.message }
          : {}),
        ...("publicKey" in parsed && isPublicJsonWebKey(parsed.publicKey)
          ? { publicKey: parsed.publicKey }
          : {}),
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isPublicJsonWebKey(value: unknown): value is JsonWebKey {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kty" in value &&
    value.kty === "EC" &&
    "crv" in value &&
    value.crv === "P-256" &&
    "x" in value &&
    typeof value.x === "string" &&
    "y" in value &&
    typeof value.y === "string" &&
    !("d" in value)
  );
}

function getCryptoUnavailableMessage(): string | undefined {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Encrypted transfer needs HTTPS. For local testing, open both tabs on localhost.";
  }
  if (globalThis.crypto?.subtle === undefined) {
    return "Encrypted transfer is not available in this browser context. Open both tabs on HTTPS or localhost.";
  }
  return undefined;
}

function getCryptoErrorMessage(error: unknown): string {
  const unavailableMessage = getCryptoUnavailableMessage();
  if (unavailableMessage !== undefined) {
    return unavailableMessage;
  }
  if (error instanceof Error && error.message.includes("Web Crypto subtle")) {
    return "Encrypted transfer is not available in this browser context. Open both tabs on HTTPS or localhost.";
  }
  return error instanceof Error ? error.message : "Could not start encrypted transfer.";
}
