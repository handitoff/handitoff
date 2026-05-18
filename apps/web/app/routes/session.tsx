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
import { sizeBucketForBytes, trackEvent } from "../lib/analytics";
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

type TransferAnalyticsState = {
  fileCount: number;
  totalBytes: number;
  completedBytes: number;
  startedAt: number;
  completed: boolean;
  failed: boolean;
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
  const transferAnalyticsRef = useRef<Map<string, TransferAnalyticsState>>(new Map());
  const stateRef = useRef<ClientSessionState>(initialClientSessionState);
  const networkTypeRef = useRef<"local" | "relay" | "unknown">("unknown");
  const configRef = useRef(loadPublicRuntimeConfig());
  const [state, dispatch] = useReducer(reduceClientSessionState, initialClientSessionState);
  const [, setChosenFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [lastDataChannelMessage, setLastDataChannelMessage] = useState("Waiting");
  const [retryKey, setRetryKey] = useState(0);
  const [networkType, setNetworkType] = useState<"local" | "relay" | "unknown">("unknown");
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{
    previewUrl: string | undefined;
    name: string;
    downloadUrl: string | undefined;
    itemId: string;
  } | null>(null);

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

  const getAnalyticsContext = useCallback(() => {
    const current = stateRef.current;
    return current.sessionId === undefined ? {} : { sessionId: current.sessionId };
  }, []);

  const trackTransferCompleted = useCallback(
    (snapshot: TransferProgressSnapshot) => {
      const transfer = transferAnalyticsRef.current.get(snapshot.transferId);
      if (transfer === undefined || transfer.completed || transfer.failed) {
        return;
      }
      transfer.completedBytes += snapshot.totalBytes;
      if (transfer.completedBytes < transfer.totalBytes) {
        return;
      }
      transfer.completed = true;
      const durationMs = Math.max(1, Date.now() - transfer.startedAt);
      const averageMbps = (transfer.totalBytes * 8) / durationMs / 1000;
      trackEvent(
        "transfer_completed",
        {
          fileCount: transfer.fileCount,
          totalBytes: transfer.totalBytes,
          sizeBucket: sizeBucketForBytes(transfer.totalBytes),
          durationMs,
          averageMbps: Number(averageMbps.toFixed(2)),
          connectionType: toAnalyticsConnectionType(networkTypeRef.current),
        },
        { ...getAnalyticsContext(), transferId: snapshot.transferId },
      );
    },
    [getAnalyticsContext],
  );

  const trackTransferFailed = useCallback(
    (snapshot: TransferProgressSnapshot) => {
      const transfer = transferAnalyticsRef.current.get(snapshot.transferId);
      if (transfer !== undefined) {
        if (transfer.failed || transfer.completed) {
          return;
        }
        transfer.failed = true;
      }
      trackEvent(
        snapshot.status === "canceled" ? "transfer_cancelled" : "transfer_failed",
        {
          fileCount: transfer?.fileCount ?? 1,
          totalBytes: transfer?.totalBytes ?? snapshot.totalBytes,
          sizeBucket: sizeBucketForBytes(transfer?.totalBytes ?? snapshot.totalBytes),
          connectionType: toAnalyticsConnectionType(networkTypeRef.current),
          failureCode: snapshot.status === "canceled" ? "cancelled" : "transfer_failed",
          errorStage: snapshot.direction,
        },
        { ...getAnalyticsContext(), transferId: snapshot.transferId },
      );
    },
    [getAnalyticsContext],
  );

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
        onOffer: (offer) => {
          transferAnalyticsRef.current.set(offer.transferId, {
            fileCount: offer.files.length,
            totalBytes: offer.totalSize,
            completedBytes: 0,
            startedAt: Date.now(),
            completed: false,
            failed: false,
          });
          trackEvent(
            "transfer_started",
            {
              fileCount: offer.files.length,
              totalBytes: offer.totalSize,
              sizeBucket: sizeBucketForBytes(offer.totalSize),
              connectionType: toAnalyticsConnectionType(networkTypeRef.current),
            },
            { ...getAnalyticsContext(), transferId: offer.transferId },
          );
          return true;
        },
        onProgress: snapshotToTransferItem,
        onComplete: (snapshot) => {
          snapshotToTransferItem(snapshot);
          trackTransferCompleted(snapshot);
        },
        onError: (snapshot) => {
          snapshotToTransferItem(snapshot);
          trackTransferFailed(snapshot);
        },
      },
    });
    return transferRef.current;
  }, [getAnalyticsContext, snapshotToTransferItem, trackTransferCompleted, trackTransferFailed]);

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
        trackEvent("peer_connected", undefined, getAnalyticsContext());
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
        networkTypeRef.current = event.networkType;
        trackEvent(
          "connection_type_detected",
          {
            connectionType: toAnalyticsConnectionType(event.networkType),
            localCandidateType: event.localCandidateType,
            remoteCandidateType: event.remoteCandidateType,
          },
          getAnalyticsContext(),
        );
        return;
      }
      if (event.type === "failed") {
        if (stateRef.current.dataChannel === "open" && stateRef.current.crypto === "ready") {
          return;
        }
        dispatch({ type: "webrtc:failed", message: event.message });
        trackEvent(
          "peer_connection_failed",
          { failureCode: "webrtc_failed", errorStage: "webrtc" },
          getAnalyticsContext(),
        );
      }
    },
    [ensureTransferController, getAnalyticsContext, sendPeerControl, sendSignal],
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

        socket.onStatus((status, reason) => {
          dispatch(
            status === "connected"
              ? { type: "socket:connected" }
              : { type: "socket:disconnected", reason },
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
    const newPreviews: Record<string, string> = {};
    for (const file of selected) {
      if (/\.(jpg|jpeg|png|gif|webp|bmp|avif|heic)$/i.test(file.name)) {
        const url = URL.createObjectURL(file);
        objectUrlsRef.current.push(url);
        newPreviews[`${file.name}:${file.size}`] = url;
      }
    }
    if (Object.keys(newPreviews).length > 0) {
      setPreviewMap((prev) => ({ ...prev, ...newPreviews }));
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
      const transferId = controller.sendFiles(selected);
      const totalBytes = selected.reduce((total, file) => total + file.size, 0);
      transferAnalyticsRef.current.set(transferId, {
        fileCount: selected.length,
        totalBytes,
        completedBytes: 0,
        startedAt: Date.now(),
        completed: false,
        failed: false,
      });
      trackEvent(
        "transfer_started",
        {
          fileCount: selected.length,
          totalBytes,
          sizeBucket: sizeBucketForBytes(totalBytes),
          connectionType: toAnalyticsConnectionType(networkTypeRef.current),
        },
        { ...getAnalyticsContext(), transferId },
      );
    } catch (error) {
      dispatch({
        type: "data-channel:failed",
        message: error instanceof Error ? error.message : "Could not start file transfer.",
      });
      trackEvent(
        "transfer_failed",
        { failureCode: "start_failed", errorStage: "start" },
        getAnalyticsContext(),
      );
    }
  };
  const cancelTransfer = (id: string, fileId: string | undefined) => {
    const transferId = id.split(":")[0] ?? id;
    transferRef.current?.cancelTransfer(transferId, fileId);
    trackEvent(
      "transfer_cancelled",
      {
        connectionType: toAnalyticsConnectionType(networkTypeRef.current),
        failureCode: "cancelled",
        errorStage: "user",
      },
      { ...getAnalyticsContext(), transferId },
    );
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
    trackEvent("session_ended", undefined, getAnalyticsContext());
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
  const localLabel = state.deviceLabel ?? "This device";
  const allTransfers = [...state.transfer.outgoing, ...state.transfer.incoming];

  const getPreviewUrl = (item: TransferItem): string | undefined => {
    if (!/\.(jpg|jpeg|png|gif|webp|bmp|avif|heic|svg)$/i.test(item.name)) return undefined;
    if (item.direction === "incoming") return item.downloadUrl;
    return previewMap[`${item.name}:${item.size}`];
  };

  return (
    <AppShell>
      {lightbox !== null ? (
        <Lightbox
          previewUrl={lightbox.previewUrl}
          name={lightbox.name}
          downloadUrl={lightbox.downloadUrl}
          downloaded={downloadedIds.has(lightbox.itemId)}
          onDownload={() => setDownloadedIds((prev) => new Set([...prev, lightbox.itemId]))}
          onClose={() => setLightbox(null)}
        />
      ) : null}
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
        <header className="xfer-topbar">
          <div className="xfer-topbar-peer">
            <DeviceIcon label={peerLabel} ready={canSendFiles} />
            <div className="xfer-device-info">
              <span className="xfer-device-name">{peerLabel}</span>
              <span className="xfer-device-status">{connectionLabel}</span>
            </div>
          </div>
          <div className="xfer-topbar-right">
            {networkType !== "unknown" ? (
              <span className={`xfer-net-badge xfer-net-badge--${networkType}`}>
                {networkType === "local" ? "◉ Direct" : "◌ Relay"}
              </span>
            ) : null}
            {hasChannelIssue ? (
              <button className="button secondary" type="button" onClick={retryConnection}>
                Retry
              </button>
            ) : null}
            <button className="button secondary" type="button" onClick={endSession}>
              End session
            </button>
          </div>
        </header>

        <div className="xfer-pool">
          {allTransfers.length === 0 ? (
            <div className="xfer-pool-empty">
              <p className="xfer-pool-empty-title">
                {canSendFiles ? "No files yet" : lastDataChannelMessage}
              </p>
              <p className="xfer-pool-empty-sub">
                {hasChannelIssue
                  ? getChannelIssueMessage(state)
                  : canSendFiles
                    ? 'Drop files anywhere or tap "Choose files" to send.'
                    : channelFootnote}
              </p>
            </div>
          ) : (
            <div className="xfer-pool-grid">
              {allTransfers.map((item) => {
                const previewUrl = getPreviewUrl(item);
                return (
                  <FileCard
                    key={item.id}
                    item={item}
                    localLabel={localLabel}
                    peerLabel={peerLabel}
                    previewUrl={previewUrl}
                    downloaded={downloadedIds.has(item.id)}
                    onDownload={() => setDownloadedIds((prev) => new Set([...prev, item.id]))}
                    onOpenLightbox={() =>
                      setLightbox({
                        previewUrl,
                        name: item.name,
                        downloadUrl: item.downloadUrl,
                        itemId: item.id,
                      })
                    }
                    onCancel={cancelTransfer}
                    onRetry={retryTransfer}
                  />
                );
              })}
            </div>
          )}
        </div>

        <footer className="xfer-sendbar">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="visually-hidden"
            onChange={(event) => readFiles(event.target.files)}
            aria-label="Choose files to send"
            disabled={!canSendFiles}
          />
          {canSendFiles ? (
            <span className="xfer-sendbar-hint">
              {dragActive ? "Release to send" : "Drop files here or"}
            </span>
          ) : (
            <span className="xfer-sendbar-status">{channelFootnote}</span>
          )}
          <button className="button" type="button" onClick={chooseFiles} disabled={!canSendFiles}>
            {canSendFiles
              ? "Choose files"
              : state.dataChannel === "open"
                ? "Securing…"
                : "Connecting…"}
          </button>
          <span className="xfer-sendbar-code">{params.code}</span>
        </footer>
      </main>
    </AppShell>
  );
}

function getFileType(name: string): "image" | "video" | "audio" | "pdf" | "archive" | "code" | "file" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (/^(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif|heic)$/.test(ext)) return "image";
  if (/^(mp4|mov|avi|mkv|webm|m4v|flv)$/.test(ext)) return "video";
  if (/^(mp3|wav|ogg|flac|aac|m4a|opus|wma)$/.test(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (/^(zip|tar|gz|bz2|rar|7z|tgz|xz)$/.test(ext)) return "archive";
  if (/^(js|ts|jsx|tsx|py|go|rs|java|c|cpp|h|cs|rb|php|html|css|json|xml|yaml|yml|toml|sh|md|txt|csv)$/.test(ext)) return "code";
  return "file";
}

function DeviceIcon({ label, ready }: { label: string; ready: boolean }) {
  const l = label.toLowerCase();
  const isTablet = l.includes("ipad");
  const isLaptop = l.includes("macbook") || (l.includes("mac") && !l.includes("android"));
  const isDesktop = l.includes("pc") || l.includes("windows") || l.includes("linux");

  const stroke = "#0a0a0a";
  const sw = "1.5";
  const common = { fill: "none", stroke, strokeWidth: sw, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (isLaptop) {
    return (
      <svg className="xfer-device-svg" viewBox="0 0 56 56" aria-hidden="true" {...common}>
        <rect x="4" y="2" width="48" height="34" rx="3" />
        <circle cx="28" cy="7" r="1.5" fill={stroke} stroke="none" />
        <text x="28" y="25" textAnchor="middle" fontSize="12" fill={stroke} stroke="none" fontFamily="system-ui">{ready ? "✓" : "…"}</text>
        <line x1="0" y1="38" x2="56" y2="38" />
        <rect x="0" y="38" width="56" height="14" rx="2" />
        <rect x="20" y="42" width="16" height="8" rx="2" />
      </svg>
    );
  }
  if (isDesktop) {
    return (
      <svg className="xfer-device-svg" viewBox="0 0 56 56" aria-hidden="true" {...common}>
        <rect x="2" y="2" width="52" height="36" rx="3" />
        <text x="28" y="24" textAnchor="middle" fontSize="12" fill={stroke} stroke="none" fontFamily="system-ui">{ready ? "✓" : "…"}</text>
        <line x1="28" y1="38" x2="28" y2="48" />
        <path d="M14 48 Q28 44 42 48" strokeWidth={sw} />
        <line x1="14" y1="48" x2="42" y2="48" />
      </svg>
    );
  }
  if (isTablet) {
    return (
      <svg className="xfer-device-svg xfer-device-svg--tall" viewBox="0 0 44 68" aria-hidden="true" {...common}>
        <rect x="3" y="2" width="38" height="64" rx="5" />
        <circle cx="22" cy="8" r="2" fill={stroke} stroke="none" />
        <circle cx="22" cy="60" r="3" />
        <text x="22" y="38" textAnchor="middle" fontSize="11" fill={stroke} stroke="none" fontFamily="system-ui">{ready ? "✓" : "…"}</text>
      </svg>
    );
  }
  return (
    <svg className="xfer-device-svg xfer-device-svg--tall" viewBox="0 0 36 68" aria-hidden="true" {...common}>
      <rect x="2" y="2" width="32" height="64" rx="7" />
      <rect x="12" y="9" width="12" height="4" rx="2" fill={stroke} stroke="none" />
      <rect x="11" y="57" width="14" height="3" rx="1.5" fill={stroke} stroke="none" />
      <text x="18" y="38" textAnchor="middle" fontSize="11" fill={stroke} stroke="none" fontFamily="system-ui">{ready ? "✓" : "…"}</text>
    </svg>
  );
}

function FileTypeIcon({ name, size }: { name: string; size?: number }) {
  const type = getFileType(name);
  const s = {
    viewBox: "0 0 32 32",
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: "1.5",
    "aria-hidden": true as const,
  };
  const w = size ?? 28;
  const style = { width: w, height: w };

  if (type === "image") return (
    <svg {...s} style={style} className={`xfer-filetype xfer-filetype--${type}`}>
      <rect x="3" y="3" width="26" height="26" rx="3" />
      <circle cx="11" cy="12" r="2.5" />
      <path d="M3 23 l8-8 5 5 4-4 9 9" />
    </svg>
  );
  if (type === "video") return (
    <svg {...s} style={style} className={`xfer-filetype xfer-filetype--${type}`}>
      <rect x="2" y="6" width="20" height="20" rx="3" />
      <path d="M22 12 l8-4v16l-8-4V12z" />
    </svg>
  );
  if (type === "audio") return (
    <svg {...s} style={style} className={`xfer-filetype xfer-filetype--${type}`}>
      <circle cx="16" cy="16" r="13" />
      <circle cx="16" cy="16" r="4" />
      <path d="M16 3a13 13 0 0 1 9.2 22.2" />
    </svg>
  );
  if (type === "pdf") return (
    <svg {...s} style={style} className={`xfer-filetype xfer-filetype--${type}`}>
      <path d="M6 2h14l8 8v20H6V2z" />
      <path d="M20 2v8h8" />
      <path d="M9 17h6M9 21h10M9 25h4" />
    </svg>
  );
  if (type === "archive") return (
    <svg {...s} style={style} className={`xfer-filetype xfer-filetype--${type}`}>
      <rect x="3" y="12" width="26" height="18" rx="2" />
      <path d="M3 12 L8 2h16l5 10" />
      <line x1="13" y1="2" x2="13" y2="12" />
      <line x1="19" y1="2" x2="19" y2="12" />
      <rect x="12" y="18" width="8" height="5" rx="1" />
    </svg>
  );
  if (type === "code") return (
    <svg {...s} style={style} className={`xfer-filetype xfer-filetype--${type}`}>
      <path d="M6 2h14l8 8v20H6V2z" />
      <path d="M20 2v8h8" />
      <path d="M11 19 l4-3-4-3M16 22h7" />
    </svg>
  );
  return (
    <svg {...s} style={style} className={`xfer-filetype xfer-filetype--file`}>
      <path d="M6 2h14l8 8v20H6V2z" />
      <path d="M20 2v8h8" />
      <path d="M9 18h14M9 22h10" />
    </svg>
  );
}

function FileCard({
  item,
  localLabel,
  peerLabel,
  previewUrl,
  downloaded,
  onDownload,
  onOpenLightbox,
  onCancel,
  onRetry,
}: {
  item: TransferItem;
  localLabel: string;
  peerLabel: string;
  previewUrl: string | undefined;
  downloaded: boolean;
  onDownload: () => void;
  onOpenLightbox: () => void;
  onCancel: (id: string, fileId: string | undefined) => void;
  onRetry: (id: string) => void;
}) {
  const pct = Math.round(item.progress * 100);
  const done = item.status === "complete";
  const failed = item.status === "failed" || item.status === "rejected";
  const canceled = item.status === "canceled";
  const active = !done && !failed && !canceled;
  const isIncoming = item.direction === "incoming";
  const type = getFileType(item.name);
  const ext = item.name.split(".").pop()?.toUpperCase() ?? "";
  const canSave = done && isIncoming && item.downloadUrl !== undefined;

  return (
    <div className="xfer-card">
      {/* Thumb — always opens lightbox */}
      <div
        className={`xfer-card-thumb xfer-thumb--${type} xfer-card-thumb--clickable`}
        onClick={onOpenLightbox}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenLightbox(); } }}
        aria-label={`Preview ${item.name}`}
      >
        {previewUrl !== undefined ? (
          <img src={previewUrl} alt="" className="xfer-card-img" />
        ) : (
          <div className="xfer-thumb-icon">
            <FileTypeIcon name={item.name} size={32} />
            {ext ? <span className="xfer-thumb-ext">{ext.slice(0, 4)}</span> : null}
          </div>
        )}
        {active ? (
          <div className="xfer-card-bar">
            <div className="xfer-card-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {failed ? <div className="xfer-card-err-mark">!</div> : null}
        {canceled ? <div className="xfer-card-canceled-mark">—</div> : null}
      </div>

      {/* Info strip */}
      <div className="xfer-card-info">
        <span className="xfer-card-name" title={item.name}>{item.name}</span>
        <div className="xfer-card-foot">
          <span className="xfer-card-from">
            {isIncoming ? `↓ ${peerLabel}` : `↑ ${localLabel}`}
          </span>
          <span className="xfer-card-size-status">
            {active ? `${pct}%` : formatBytes(item.size)}
          </span>
          {active ? (
            <button
              className="xfer-card-cancel"
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancel(item.id, item.fileId); }}
              aria-label="Cancel"
            >×</button>
          ) : null}
          {failed ? (
            <button className="xfer-card-retry" type="button" onClick={(e) => { e.stopPropagation(); onRetry(item.id); }}>
              Retry
            </button>
          ) : null}
        </div>
        {item.error !== undefined ? (
          <span className="xfer-card-error">{item.error}</span>
        ) : null}
      </div>

      {/* Full-width save button for received files — easy to tap */}
      {canSave ? (
        <a
          className={`xfer-card-save-btn${downloaded ? " xfer-card-save-btn--saved" : ""}`}
          href={item.downloadUrl}
          download={item.name}
          onClick={(e) => { e.stopPropagation(); onDownload(); }}
        >
          {downloaded ? "✓ Saved" : "↓ Save"}
        </a>
      ) : null}
    </div>
  );
}

function Lightbox({
  previewUrl,
  name,
  downloadUrl,
  downloaded,
  onDownload,
  onClose,
}: {
  previewUrl: string | undefined;
  name: string;
  downloadUrl: string | undefined;
  downloaded: boolean;
  onDownload: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="xfer-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Preview of ${name}`}>
      <button className="xfer-lightbox-close" type="button" onClick={onClose} aria-label="Close">×</button>

      <div className="xfer-lightbox-content" onClick={(e) => e.stopPropagation()}>
        {previewUrl !== undefined ? (
          <img src={previewUrl} alt={name} className="xfer-lightbox-img" />
        ) : (
          <div className={`xfer-lightbox-icon xfer-thumb--${getFileType(name)}`}>
            <FileTypeIcon name={name} size={72} />
          </div>
        )}

        <div className="xfer-lightbox-bar">
          <span className="xfer-lightbox-name">{name}</span>
          {downloadUrl !== undefined ? (
            <a
              className={`xfer-lightbox-dl${downloaded ? " xfer-lightbox-dl--saved" : ""}`}
              href={downloadUrl}
              download={name}
              onClick={onDownload}
            >
              {downloaded ? "✓ Saved" : "↓ Save"}
            </a>
          ) : null}
        </div>
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

function toAnalyticsConnectionType(networkType: "local" | "relay" | "unknown"): string {
  if (networkType === "local") return "direct";
  if (networkType === "relay") return "relayed";
  return "unknown";
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
