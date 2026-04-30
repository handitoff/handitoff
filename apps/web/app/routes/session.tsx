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
  return [{ title: `Session ${params.code} - handitoff.io` }];
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
            message: error instanceof Error ? error.message : "Transfer message failed.",
          });
        });
        setLastDataChannelMessage("Transfer update");
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
        className="stage"
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
        <section className="hero-panel">
          <div className="section-label">No. 002 - {canSendFiles ? "Ready" : "Pairing"}</div>
          <h1 className="display-title">
            Drop
            <br />
            anything.
          </h1>
          <p className="lede">
            Files dropped here will appear on the paired device. Photos, archives, documents,
            anything you need to hand off.
          </p>
          {hasChannelIssue ? (
            <p className="lede">
              The direct browser connection dropped. Retry restarts the connection without creating
              a new pairing code.
            </p>
          ) : null}
          <div className="drop-strip" aria-label="File drop area">
            <span>{dragActive ? "Release to stage files" : "Drop files anywhere"}</span>
            <span>{params.code}</span>
          </div>
          <div className="panel-actions panel-actions--left">
            <input
              ref={inputRef}
              type="file"
              multiple
              className="visually-hidden"
              onChange={(event) => readFiles(event.target.files)}
              aria-label="Choose files to send"
              disabled={!canSendFiles}
            />
            <button className="button" type="button" onClick={chooseFiles} disabled={!canSendFiles}>
              {canSendFiles
                ? "Choose files"
                : state.dataChannel === "open"
                  ? "Securing transfer"
                  : "Waiting for channel"}
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
        </section>
        <div className="hairline" />
        <aside className="side-panel">
          <div className="panel-head">
            <span>{canSendFiles ? "Ready" : hasChannelIssue ? "Needs retry" : "Connecting"}</span>
            <span>02</span>
          </div>
          <div className="device-paired">
            <div className="phone-outline" aria-hidden="true">
              <div className="phone-speaker" />
              <span>{canSendFiles ? "OK" : "..."}</span>
            </div>
            <div>
              <h2>{peerLabel}</h2>
              <p>{connectionLabel}</p>
            </div>
          </div>
          <div className="transfer-list">
            <TransferRows
              title="01 Outbound"
              empty={chosenFiles.length === 0 ? "Empty" : `${chosenFiles.length} queued`}
              items={outgoingTransfers}
              onCancel={cancelTransfer}
              onRetry={retryTransfer}
            />
            <TransferRows
              title="02 Inbound"
              empty={lastDataChannelMessage}
              items={incomingTransfers}
              onCancel={cancelTransfer}
              onRetry={retryTransfer}
            />
          </div>
          <div className="panel-foot">
            <span>{channelFootnote}</span>
          </div>
        </aside>
      </main>
    </AppShell>
  );
}

function TransferRows({
  title,
  empty,
  items,
  onCancel,
  onRetry,
}: {
  title: string;
  empty: string;
  items: TransferItem[];
  onCancel: (id: string, fileId: string | undefined) => void;
  onRetry: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="progress-row">
        <div className="progress-fill" style={{ width: "0%" }} />
        <span>{title}</span>
        <span>{empty}</span>
      </div>
    );
  }

  return (
    <>
      {items.map((item) => (
        <div className="progress-row progress-row--file" key={item.id}>
          <div className="progress-fill" style={{ width: `${Math.round(item.progress * 100)}%` }} />
          <span title={item.name}>{item.name}</span>
          <span>{formatTransferStatus(item)}</span>
          <div className="transfer-actions">
            {item.downloadUrl !== undefined && item.status === "complete" ? (
              <a className="mini-action" href={item.downloadUrl} download={item.name}>
                Save
              </a>
            ) : null}
            {item.status === "failed" || item.status === "rejected" ? (
              <button className="mini-action" type="button" onClick={() => onRetry(item.id)}>
                Retry
              </button>
            ) : null}
            {item.status !== "complete" &&
            item.status !== "failed" &&
            item.status !== "canceled" ? (
              <button
                className="mini-action"
                type="button"
                onClick={() => onCancel(item.id, item.fileId)}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </>
  );
}

function formatTransferStatus(item: TransferItem): string {
  if (item.error !== undefined) {
    return item.error;
  }
  if (item.status === "complete") {
    return "Complete";
  }
  if (item.status === "failed") {
    return "Failed";
  }
  if (item.status === "canceled") {
    return "Canceled";
  }
  return `${Math.round(item.progress * 100)}%`;
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
