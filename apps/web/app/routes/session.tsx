import type { Route } from "./+types/session";
import {
  deriveAesGcmKey,
  exportEcdhPublicKey,
  generateEcdhKeyPair,
  importEcdhPublicKey,
  type EcdhKeyPair,
} from "@handitoff/crypto";
import {
  BrowserTransferController,
  type FileIssue,
  type TransferProgressSnapshot,
} from "@handitoff/transfer";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AppShell } from "../components/app-shell";
import { FeedbackModal } from "../components/feedback-modal";
import {
  initialClientSessionState,
  reduceClientSessionState,
  type ClientSessionState,
  type TransferItem,
} from "../lib/session-store";
import { loadPublicRuntimeConfig } from "../lib/runtime-config";
import { seoMeta } from "../lib/seo";
import { inferBrowser, inferOs, sizeBucketForBytes, trackEvent } from "../lib/analytics";
import { HanditoffWebSocketClient } from "../lib/websocket-client";
import { WebRtcPeer, type WebRtcPeerEvent } from "../lib/webrtc-peer";
import type { FileOfferMessage } from "@handitoff/protocol";
import type { FeedbackDebugInfo } from "../lib/feedback";

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
  startedFileIds: Set<string>;
  completedFileIds: Set<string>;
  failedFileIds: Set<string>;
};

type PendingIncomingOffer = {
  fileCount: number;
  totalSize: number;
  resolve: (accepted: boolean) => void;
};

type SpeedSample = { time: number; bytes: number };

type ErrorReportContext = FeedbackDebugInfo & { sessionId?: string };

const IOS_SAFARI_CHUNK_SIZE_BYTES = 64 * 1024;
const IOS_SAFARI_BUFFERED_AMOUNT_LOW_THRESHOLD_BYTES = 512 * 1024;
const IOS_SAFARI_BUFFERED_AMOUNT_PAUSE_THRESHOLD_BYTES = 2 * 1024 * 1024;

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
  const speedSamplesRef = useRef<Map<string, SpeedSample[]>>(new Map());
  const pendingOfferResolveRef = useRef<((accepted: boolean) => void) | undefined>(undefined);
  const reservedSessionTransferBytesRef = useRef(0);

  const [state, dispatch] = useReducer(reduceClientSessionState, initialClientSessionState);
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
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState(0);
  const [pendingOffer, setPendingOffer] = useState<PendingIncomingOffer | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [speedMap, setSpeedMap] = useState<Record<string, number>>({});
  const [etaMap, setEtaMap] = useState<Record<string, number>>({});
  const [pairedAt, setPairedAt] = useState<number | undefined>(undefined);
  const [peerLimitReached, setPeerLimitReached] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [errorReport, setErrorReport] = useState<ErrorReportContext | null>(null);
  const limitSignalSentRef = useRef(false);
  const sessionEndScheduledRef = useRef(false);

  useEffect(() => {
    document.body.classList.add("session-active");
    return () => document.body.classList.remove("session-active");
  }, []);

  stateRef.current = state;

  // Session countdown timer — starts when pairedAt is recorded
  useEffect(() => {
    if (pairedAt === undefined) return;
    const ttl = configRef.current.limits.pairedSessionTtlSeconds;
    const expiresAt = pairedAt + ttl * 1000;

    const update = () => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSessionSecondsLeft(left);
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [pairedAt, retryKey]);

  // Speed/ETA update interval — every 1.5 seconds
  useEffect(() => {
    const interval = window.setInterval(() => {
      const allItems = [
        ...stateRef.current.transfer.outgoing,
        ...stateRef.current.transfer.incoming,
      ];
      const newSpeeds: Record<string, number> = {};
      const newEtas: Record<string, number> = {};

      for (const item of allItems) {
        if (item.status !== "transferring") continue;
        const key = item.id;
        const samples = speedSamplesRef.current.get(key) ?? [];
        if (samples.length < 2) continue;
        const oldest = samples[0]!;
        const newest = samples[samples.length - 1]!;
        const dt = (newest.time - oldest.time) / 1000;
        if (dt < 0.5) continue;
        const db = newest.bytes - oldest.bytes;
        const bps = Math.max(0, db / dt);
        newSpeeds[key] = bps;
        const remaining = item.size - (item.bytesTransferred ?? 0);
        if (bps > 0 && remaining > 0) {
          newEtas[key] = Math.ceil(remaining / bps);
        }
      }

      setSpeedMap(newSpeeds);
      setEtaMap(newEtas);
    }, 1500);
    return () => window.clearInterval(interval);
  }, []);

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
    const id = `${snapshot.transferId}:${snapshot.fileId ?? "transfer"}`;

    // Update speed samples
    if (snapshot.status === "transferring" && snapshot.bytesTransferred > 0) {
      const samples = speedSamplesRef.current.get(id) ?? [];
      samples.push({ time: Date.now(), bytes: snapshot.bytesTransferred });
      // Keep last 8 seconds of samples
      const cutoff = Date.now() - 8000;
      speedSamplesRef.current.set(
        id,
        samples.filter((s) => s.time >= cutoff),
      );
    }

    dispatch({
      type: "transfer:upsert",
      item: {
        id,
        name: snapshot.name ?? "Transfer",
        size: snapshot.totalBytes,
        progress: snapshot.progress,
        direction: snapshot.direction,
        ...(snapshot.fileId === undefined ? {} : { fileId: snapshot.fileId }),
        status: snapshot.status,
        ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
        ...(snapshot.downloadUrl === undefined ? {} : { downloadUrl: snapshot.downloadUrl }),
        ...(snapshot.issue === undefined ? {} : { issue: snapshot.issue }),
        retryable: snapshot.retryable ?? false,
        bytesTransferred: snapshot.bytesTransferred,
      },
    });
  }, []);

  const getAnalyticsContext = useCallback(() => {
    const current = stateRef.current;
    return current.sessionId === undefined ? {} : { sessionId: current.sessionId };
  }, []);

  const trackTransferFileStarted = useCallback(
    (snapshot: TransferProgressSnapshot) => {
      if (snapshot.fileId === undefined || snapshot.status !== "transferring") {
        return;
      }
      const transfer = transferAnalyticsRef.current.get(snapshot.transferId);
      if (transfer === undefined || transfer.startedFileIds.has(snapshot.fileId)) {
        return;
      }
      transfer.startedFileIds.add(snapshot.fileId);
      trackEvent(
        "transfer_file_started",
        {
          totalBytes: snapshot.totalBytes,
          sizeBucket: sizeBucketForBytes(snapshot.totalBytes),
          direction: snapshot.direction,
          connectionType: toAnalyticsConnectionType(networkTypeRef.current),
        },
        { ...getAnalyticsContext(), transferId: snapshot.transferId },
      );
    },
    [getAnalyticsContext],
  );

  const trackTransferCompleted = useCallback(
    (snapshot: TransferProgressSnapshot) => {
      const transfer = transferAnalyticsRef.current.get(snapshot.transferId);
      if (transfer === undefined || transfer.completed || transfer.failed) {
        return;
      }
      if (snapshot.fileId !== undefined && !transfer.completedFileIds.has(snapshot.fileId)) {
        transfer.completedFileIds.add(snapshot.fileId);
        trackEvent(
          "transfer_file_completed",
          {
            totalBytes: snapshot.totalBytes,
            sizeBucket: sizeBucketForBytes(snapshot.totalBytes),
            direction: snapshot.direction,
            connectionType: toAnalyticsConnectionType(networkTypeRef.current),
          },
          { ...getAnalyticsContext(), transferId: snapshot.transferId },
        );
      }
      transfer.completedBytes += snapshot.totalBytes;
      if (transfer.completedBytes < transfer.totalBytes) {
        return;
      }
      transfer.completed = true;
      const durationMs = Math.max(1, Date.now() - transfer.startedAt);
      const averageMbps = (transfer.totalBytes * 8) / durationMs / 1000;
      trackEvent(
        "transfer_batch_completed",
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
      const failureCode =
        snapshot.status === "canceled" ? "cancelled" : (snapshot.issue ?? "transfer_failed");
      const failureStage = snapshot.failureStage ?? failureStageForIssue(failureCode);
      if (
        transfer !== undefined &&
        snapshot.fileId !== undefined &&
        !transfer.failedFileIds.has(snapshot.fileId)
      ) {
        transfer.failedFileIds.add(snapshot.fileId);
        trackEvent(
          snapshot.status === "canceled" ? "transfer_file_cancelled" : "transfer_file_failed",
          {
            totalBytes: snapshot.totalBytes,
            sizeBucket: sizeBucketForBytes(snapshot.totalBytes),
            direction: snapshot.direction,
            connectionType: toAnalyticsConnectionType(networkTypeRef.current),
            failureCode,
            failureStage,
          },
          { ...getAnalyticsContext(), transferId: snapshot.transferId },
        );
      }
      if (transfer !== undefined) {
        if (transfer.failed || transfer.completed) {
          return;
        }
        transfer.failed = true;
      }
      trackEvent(
        snapshot.status === "canceled" ? "transfer_batch_cancelled" : "transfer_batch_failed",
        {
          fileCount: transfer?.fileCount ?? 1,
          totalBytes: transfer?.totalBytes ?? snapshot.totalBytes,
          sizeBucket: sizeBucketForBytes(transfer?.totalBytes ?? snapshot.totalBytes),
          connectionType: toAnalyticsConnectionType(networkTypeRef.current),
          failureCode,
          failureStage,
        },
        { ...getAnalyticsContext(), transferId: snapshot.transferId },
      );
    },
    [getAnalyticsContext],
  );

  const triggerErrorReport = useCallback((snapshot: TransferProgressSnapshot) => {
    if (
      snapshot.status === "canceled" ||
      snapshot.issue === "file_too_large" ||
      snapshot.issue === "too_many_files" ||
      snapshot.issue === "transfer_too_large" ||
      snapshot.issue === "unsupported_file" ||
      snapshot.issue === "browser_limit"
    ) {
      return;
    }
    const transfer = transferAnalyticsRef.current.get(snapshot.transferId);
    const durationMs = transfer !== undefined ? Date.now() - transfer.startedAt : undefined;
    const current = stateRef.current;
    setErrorReport({
      sessionId: current.sessionId,
      errorCode: snapshot.issue ?? "transfer_failed",
      connectionType: toAnalyticsConnectionType(networkTypeRef.current),
      browser: inferBrowser(navigator.userAgent),
      os: inferOs(navigator.userAgent),
      sessionState: current.connection,
      sizeBucket: sizeBucketForBytes(snapshot.totalBytes),
      ...(durationMs !== undefined ? { durationMs } : {}),
    });
  }, []);

  const failActiveTransfersForConnectionLoss = useCallback((message: string) => {
    for (const item of [
      ...stateRef.current.transfer.outgoing,
      ...stateRef.current.transfer.incoming,
    ]) {
      if (
        item.status !== "offered" &&
        item.status !== "accepted" &&
        item.status !== "transferring"
      ) {
        continue;
      }
      dispatch({
        type: "transfer:upsert",
        item: {
          ...item,
          status: "failed",
          issue: "connection_lost",
          error: message,
          retryable: true,
        },
      });
    }
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
      maxFileSizeBytes: configRef.current.limits.maxFileSizeBytes,
      maxFilesPerTransfer: configRef.current.limits.maxFilesPerTransfer,
      maxTotalTransferSizeBytes: configRef.current.limits.maxTotalTransferSizeBytes,
      ...(isLikelyIosSafari()
        ? {
            backpressure: {
              lowThresholdBytes: IOS_SAFARI_BUFFERED_AMOUNT_LOW_THRESHOLD_BYTES,
              pauseThresholdBytes: IOS_SAFARI_BUFFERED_AMOUNT_PAUSE_THRESHOLD_BYTES,
              pollIntervalMs: 50,
            },
          }
        : {}),
      createObjectUrl: (blob) => {
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
        return url;
      },
      events: {
        onOffer: (offer: FileOfferMessage) => {
          const maxSessionBytes = configRef.current.limits.maxTotalTransferSizeBytes;
          if (reservedSessionTransferBytesRef.current + offer.totalSize > maxSessionBytes) {
            dispatch({
              type: "transfer:upsert",
              item: {
                id: `invalid:${offer.transferId}:${Date.now()}`,
                name: "Incoming transfer",
                size: offer.totalSize,
                progress: 0,
                direction: "incoming",
                status: "failed",
                issue: "transfer_too_large",
                retryable: false,
                error: `Exceeds the ${formatBytes(maxSessionBytes)} session limit.`,
                bytesTransferred: 0,
              },
            });
            trackEvent(
              "transfer_batch_failed",
              {
                fileCount: offer.files.length,
                totalBytes: offer.totalSize,
                sizeBucket: sizeBucketForBytes(offer.totalSize),
                direction: "incoming",
                connectionType: toAnalyticsConnectionType(networkTypeRef.current),
                failureCode: "transfer_too_large",
                failureStage: "validation",
              },
              { ...getAnalyticsContext(), transferId: offer.transferId },
            );
            return false;
          }
          transferAnalyticsRef.current.set(
            offer.transferId,
            createTransferAnalyticsState(offer.files.length, offer.totalSize),
          );
          trackEvent(
            "transfer_batch_started",
            {
              fileCount: offer.files.length,
              totalBytes: offer.totalSize,
              sizeBucket: sizeBucketForBytes(offer.totalSize),
              connectionType: toAnalyticsConnectionType(networkTypeRef.current),
            },
            { ...getAnalyticsContext(), transferId: offer.transferId },
          );
          // Show incoming approval dialog
          return new Promise<boolean>((resolve) => {
            const resolveOffer = (accepted: boolean) => {
              if (accepted) {
                reservedSessionTransferBytesRef.current += offer.totalSize;
              }
              resolve(accepted);
            };
            pendingOfferResolveRef.current = resolveOffer;
            setPendingOffer({
              fileCount: offer.files.length,
              totalSize: offer.totalSize,
              resolve: resolveOffer,
            });
          });
        },
        onProgress: (snapshot) => {
          trackTransferFileStarted(snapshot);
          snapshotToTransferItem(snapshot);
        },
        onComplete: (snapshot) => {
          snapshotToTransferItem(snapshot);
          trackTransferCompleted(snapshot);
        },
        onError: (snapshot) => {
          snapshotToTransferItem(snapshot);
          trackTransferFailed(snapshot);
          triggerErrorReport(snapshot);
        },
      },
    });
    return transferRef.current;
  }, [
    getAnalyticsContext,
    snapshotToTransferItem,
    trackTransferCompleted,
    trackTransferFailed,
    trackTransferFileStarted,
    triggerErrorReport,
  ]);

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
        trackEvent("session_peer_connected", undefined, getAnalyticsContext());
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
          const message =
            "The file channel closed during transfer. This usually means the paired tab closed, the device locked or slept, or one side changed networks.";
          failActiveTransfersForConnectionLoss(message);
          dispatch({
            type: "data-channel:failed",
            message,
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
          if (parsed?.type === "limit:reached") {
            setPeerLimitReached(true);
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
          "session_connection_type_detected",
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
          "session_connection_failed",
          { failureCode: "webrtc_failed", failureStage: "connection" },
          getAnalyticsContext(),
        );
      }
    },
    [
      ensureTransferController,
      failActiveTransfersForConnectionLoss,
      getAnalyticsContext,
      sendPeerControl,
      sendSignal,
    ],
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
    setSessionSecondsLeft(configRef.current.limits.pairedSessionTtlSeconds);
    setPairedAt(Date.now());

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

  // Local session expiry: client-side timer reached zero
  const sessionExpiresAt =
    pairedAt === undefined
      ? undefined
      : pairedAt + configRef.current.limits.pairedSessionTtlSeconds * 1000;
  const isSessionTimerExpired =
    sessionExpiresAt !== undefined && sessionSecondsLeft === 0 && Date.now() >= sessionExpiresAt;
  const isSessionExpired = state.connection === "expired" || isSessionTimerExpired;
  const isSessionEnded = state.connection === "ended";

  const hasChannelIssue =
    state.dataChannel === "failed" ||
    state.crypto === "failed" ||
    (state.webrtc === "failed" && state.dataChannel !== "open");
  const peerLabel = state.peerDeviceLabel ?? "Paired device";
  const localLabel = state.deviceLabel ?? "This device";
  const allTransfers = [...state.transfer.outgoing, ...state.transfer.incoming];

  const hasAnyFailed = allTransfers.some(
    (i) => i.status === "failed" || i.status === "canceled" || i.status === "rejected",
  );
  const hasAnyCompleted = allTransfers.some((i) => i.status === "complete");
  const hasActiveTransfers = hasActiveTransfer(state.transfer);
  const allDoneOrFailed = allTransfers.length > 0 && !hasActiveTransfers;

  const maxFiles = configRef.current.limits.maxFilesPerTransfer;
  const completedCount = allTransfers.filter((i) => i.status === "complete").length;
  const localLimitReached = maxFiles > 0 && completedCount >= maxFiles && !hasActiveTransfers;

  // When both peers have completed all files, end the session
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!localLimitReached) return;
    if (!limitSignalSentRef.current && state.dataChannel === "open") {
      limitSignalSentRef.current = true;
      sendPeerControl({ type: "limit:reached" });
    }
    if (peerLimitReached && !sessionEndScheduledRef.current) {
      sessionEndScheduledRef.current = true;
      const timer = window.setTimeout(endSession, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [localLimitReached, peerLimitReached, state.dataChannel, sendPeerControl]);

  const canSendFiles =
    state.dataChannel === "open" &&
    state.crypto === "ready" &&
    !isSessionExpired &&
    !localLimitReached;
  const connectionLabel = getConnectionLabel(state, canSendFiles, hasChannelIssue, networkType);
  const channelFootnote = getChannelFootnote(state, canSendFiles, hasChannelIssue);
  const iosSafari = isLikelyIosSafari();
  const iosLargeFileWarning =
    iosSafari && canSendFiles
      ? "Keep Safari open and the screen unlocked while files transfer. iPhone Safari is best under 1 GB; 1 GB+ transfers can be unstable."
      : undefined;

  const getPreviewUrl = (item: TransferItem): string | undefined => {
    if (!/\.(jpg|jpeg|png|gif|webp|bmp|avif|heic|svg)$/i.test(item.name)) return undefined;
    if (item.direction === "incoming") return item.downloadUrl;
    return previewMap[`${item.name}:${item.size}`];
  };

  const readFiles = (files: FileList | null) => {
    const selected = files === null ? [] : Array.from(files);
    if (selected.length === 0) return;

    const maxFileSizeBytes = configRef.current.limits.maxFileSizeBytes;
    const maxFilesPerTransfer = configRef.current.limits.maxFilesPerTransfer;
    const maxSessionBytes = configRef.current.limits.maxTotalTransferSizeBytes;
    const totalSelectedBytes = selected.reduce((total, file) => total + file.size, 0);
    const currentCompleted = allTransfers.filter((i) => i.status === "complete").length;
    const remaining = maxFilesPerTransfer - currentCompleted;

    if (selected.length > remaining) {
      dispatch({
        type: "transfer:upsert",
        item: {
          id: `invalid:too-many-files:${Date.now()}`,
          name: "Selected files",
          size: totalSelectedBytes,
          progress: 0,
          direction: "outgoing",
          status: "failed",
          issue: "too_many_files",
          retryable: false,
          error:
            remaining <= 0
              ? `Session is full (${maxFilesPerTransfer} file limit).`
              : `Only ${remaining} slot${remaining === 1 ? "" : "s"} left (${maxFilesPerTransfer} file limit).`,
          bytesTransferred: 0,
        },
      });
      trackEvent(
        "transfer_batch_failed",
        {
          fileCount: selected.length,
          totalBytes: totalSelectedBytes,
          sizeBucket: sizeBucketForBytes(totalSelectedBytes),
          connectionType: toAnalyticsConnectionType(networkTypeRef.current),
          failureCode: "too_many_files",
          failureStage: "validation",
        },
        getAnalyticsContext(),
      );
      return;
    }

    const validFiles: File[] = [];

    for (const file of selected) {
      if (file.size > maxFileSizeBytes) {
        const id = `invalid:${file.name}:${file.size}:${Date.now()}`;
        dispatch({
          type: "transfer:upsert",
          item: {
            id,
            name: file.name,
            size: file.size,
            progress: 0,
            direction: "outgoing",
            status: "failed",
            issue: "file_too_large",
            retryable: false,
            error: iosSafari
              ? `Exceeds the ${formatBytes(maxFileSizeBytes)} limit. iPhone Safari transfers around 1 GB or larger are not fully supported.`
              : `Exceeds the ${formatBytes(maxFileSizeBytes)} limit.`,
            bytesTransferred: 0,
          },
        });
        trackEvent(
          "transfer_file_failed",
          {
            totalBytes: file.size,
            sizeBucket: sizeBucketForBytes(file.size),
            direction: "outgoing",
            connectionType: toAnalyticsConnectionType(networkTypeRef.current),
            failureCode: "file_too_large",
            failureStage: "validation",
          },
          getAnalyticsContext(),
        );
      } else {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) return;

    const validTotalBytes = validFiles.reduce((total, file) => total + file.size, 0);
    if (reservedSessionTransferBytesRef.current + validTotalBytes > maxSessionBytes) {
      dispatch({
        type: "transfer:upsert",
        item: {
          id: `invalid:transfer-too-large:${Date.now()}`,
          name: "Selected files",
          size: validTotalBytes,
          progress: 0,
          direction: "outgoing",
          status: "failed",
          issue: "transfer_too_large",
          retryable: false,
          error: `Exceeds the ${formatBytes(maxSessionBytes)} session limit.`,
          bytesTransferred: 0,
        },
      });
      trackEvent(
        "transfer_batch_failed",
        {
          fileCount: validFiles.length,
          totalBytes: validTotalBytes,
          sizeBucket: sizeBucketForBytes(validTotalBytes),
          connectionType: toAnalyticsConnectionType(networkTypeRef.current),
          failureCode: "transfer_too_large",
          failureStage: "validation",
        },
        getAnalyticsContext(),
      );
      return;
    }

    // Generate previews for valid image files
    const newPreviews: Record<string, string> = {};
    for (const file of validFiles) {
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
      const transferId = controller.sendFiles(validFiles, {
        ...(iosSafari ? { chunkSizeBytes: IOS_SAFARI_CHUNK_SIZE_BYTES } : {}),
        maxHashableFileBytes: maxFileSizeBytes,
        maxFilesPerTransfer,
        maxTotalTransferSizeBytes: maxSessionBytes,
      });
      const totalBytes = validFiles.reduce((total, file) => total + file.size, 0);
      reservedSessionTransferBytesRef.current += totalBytes;
      transferAnalyticsRef.current.set(
        transferId,
        createTransferAnalyticsState(validFiles.length, totalBytes),
      );
      trackEvent(
        "transfer_batch_started",
        {
          fileCount: validFiles.length,
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
        "transfer_batch_failed",
        { failureCode: "start_failed", failureStage: "validation" },
        getAnalyticsContext(),
      );
    }
  };

  const chooseFiles = () => inputRef.current?.click();

  const cancelTransfer = (id: string, fileId: string | undefined) => {
    const transferId = id.split(":")[0] ?? id;
    transferRef.current?.cancelTransfer(transferId, fileId);
    trackEvent(
      "transfer_batch_cancelled",
      {
        connectionType: toAnalyticsConnectionType(networkTypeRef.current),
        failureCode: "cancelled",
        failureStage: "validation",
      },
      { ...getAnalyticsContext(), transferId },
    );
  };

  const cancelAllTransfers = () => {
    const allItems = [...state.transfer.outgoing, ...state.transfer.incoming];
    const transferIds = new Set(allItems.map((i) => i.id.split(":")[0] ?? i.id));
    for (const transferId of transferIds) {
      transferRef.current?.cancelTransfer(transferId);
    }
    trackEvent(
      "transfer_batch_cancelled",
      {
        connectionType: toAnalyticsConnectionType(networkTypeRef.current),
        failureCode: "cancelled_all",
        failureStage: "validation",
      },
      getAnalyticsContext(),
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

  const removeItem = (id: string) => {
    dispatch({ type: "transfer:remove", id });
  };

  const removeFailedItems = () => {
    dispatch({ type: "transfer:remove-failed" });
  };

  const markDownloaded = useCallback(
    (item: TransferItem) => {
      if (downloadedIds.has(item.id)) {
        return;
      }
      setDownloadedIds((prev) => new Set([...prev, item.id]));
      const transferId = item.id.split(":")[0] ?? item.id;
      trackEvent(
        "transfer_file_downloaded",
        {
          totalBytes: item.size,
          sizeBucket: sizeBucketForBytes(item.size),
          direction: item.direction,
          connectionType: toAnalyticsConnectionType(networkTypeRef.current),
        },
        { ...getAnalyticsContext(), transferId },
      );
    },
    [downloadedIds, getAnalyticsContext],
  );

  const clearAllItems = () => {
    dispatch({ type: "transfer:clear" });
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
    dispatch({ type: "session:ended" });
  };

  const copyLink = () => {
    const code = params.code.toUpperCase();
    const url = `${window.location.origin}/join/${code}`;
    void navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1600);
    });
  };

  const approveIncoming = () => {
    pendingOfferResolveRef.current?.(true);
    pendingOfferResolveRef.current = undefined;
    setPendingOffer(null);
  };

  const rejectIncoming = () => {
    pendingOfferResolveRef.current?.(false);
    pendingOfferResolveRef.current = undefined;
    setPendingOffer(null);
  };

  // Session timer display
  const sessionTimerLabel = formatSessionTimer(sessionSecondsLeft);

  // Expired banner text
  const expiredBannerText = hasActiveTransfers
    ? "Session time expired. Finishing current transfers…"
    : "Session time expired. No new files can be added.";

  return (
    <AppShell>
      {feedbackOpen ? (
        <FeedbackModal
          type="feedback"
          sessionId={state.sessionId}
          onClose={() => setFeedbackOpen(false)}
        />
      ) : null}

      {errorReport !== null ? (
        <FeedbackModal
          type="error_report"
          sessionId={errorReport.sessionId}
          debugInfo={errorReport}
          onClose={() => setErrorReport(null)}
        />
      ) : null}

      {lightbox !== null ? (
        <Lightbox
          previewUrl={lightbox.previewUrl}
          name={lightbox.name}
          downloadUrl={lightbox.downloadUrl}
          downloaded={downloadedIds.has(lightbox.itemId)}
          onDownload={() => {
            const item = allTransfers.find((candidate) => candidate.id === lightbox.itemId);
            if (item !== undefined) {
              markDownloaded(item);
            }
          }}
          onClose={() => setLightbox(null)}
        />
      ) : null}

      {/* Incoming approval overlay */}
      {pendingOffer !== null ? (
        <div className="xfer-approval-overlay">
          <div className="xfer-approval-card">
            <p className="xfer-approval-title">Incoming files</p>
            <p className="xfer-approval-detail">
              {peerLabel} wants to send:{" "}
              <strong>
                {pendingOffer.fileCount} {pendingOffer.fileCount === 1 ? "file" : "files"}
              </strong>{" "}
              · <strong>{formatBytes(pendingOffer.totalSize)} total</strong>
            </p>
            <div className="xfer-approval-actions">
              <button className="button" type="button" onClick={approveIncoming}>
                Accept
              </button>
              <button className="button secondary" type="button" onClick={rejectIncoming}>
                Reject
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main
        className="xfer-stage"
        onDragEnter={(event) => {
          event.preventDefault();
          if (canSendFiles) setDragActive(true);
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
          if (canSendFiles) readFiles(event.dataTransfer.files);
        }}
      >
        <header className="xfer-topbar">
          <div className="xfer-topbar-peer">
            <DeviceIcon label={peerLabel} ready={canSendFiles} />
            <div className="xfer-device-info">
              <span className="xfer-device-name">{peerLabel}</span>
              <span
                className={`xfer-device-status${canSendFiles ? " xfer-device-status--ok" : ""}`}
              >
                {connectionLabel}
              </span>
            </div>
          </div>
          <div className="xfer-topbar-right">
            {pairedAt !== undefined && !isSessionExpired ? (
              <span className="xfer-session-timer" title="Paired session time remaining">
                {sessionTimerLabel}
              </span>
            ) : null}
            {hasChannelIssue ? (
              <button className="button secondary" type="button" onClick={retryConnection}>
                Retry
              </button>
            ) : null}

            {/* Desktop: inline actions */}
            <div className="xfer-topbar-actions">
              <span className="xfer-topbar-code">{params.code.toUpperCase()}</span>
              <button className="button secondary" type="button" onClick={copyLink}>
                {linkCopied ? "Copied ✓" : "Copy link"}
              </button>
              <button className="button secondary" type="button" onClick={endSession}>
                End session
              </button>
              <button
                className="xfer-feedback-btn"
                type="button"
                onClick={() => setFeedbackOpen(true)}
                title="Share feedback"
              >
                Feedback
              </button>
            </div>

            {/* Mobile: overflow menu */}
            <div className="xfer-topbar-menu">
              <button
                className="xfer-topbar-menu-toggle"
                type="button"
                aria-label="Session menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                  <circle cx="10" cy="4" r="1.6" fill="currentColor" />
                  <circle cx="10" cy="10" r="1.6" fill="currentColor" />
                  <circle cx="10" cy="16" r="1.6" fill="currentColor" />
                </svg>
              </button>
              {menuOpen ? (
                <>
                  <div className="xfer-topbar-menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="xfer-topbar-menu-dropdown" role="menu">
                    <span className="xfer-topbar-menu-code">{params.code.toUpperCase()}</span>
                    <button
                      className="xfer-menu-item"
                      type="button"
                      role="menuitem"
                      onClick={copyLink}
                    >
                      {linkCopied ? "Copied ✓" : "Copy link"}
                    </button>
                    <button
                      className="xfer-menu-item"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setFeedbackOpen(true);
                      }}
                    >
                      Feedback
                    </button>
                    <button
                      className="xfer-menu-item xfer-menu-item--danger"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        endSession();
                      }}
                    >
                      End session
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        {/* Session expired/ended banners */}
        {isSessionExpired && !isSessionEnded ? (
          <div className="xfer-banner xfer-banner--warn">{expiredBannerText}</div>
        ) : null}
        {isSessionEnded ? (
          <div className="xfer-banner xfer-banner--info">
            <span>Session ended.</span>
            <button className="xfer-banner-btn" type="button" onClick={() => navigate("/")}>
              Start new session
            </button>
          </div>
        ) : null}
        {iosLargeFileWarning !== undefined ? (
          <div className="xfer-banner xfer-banner--warn">{iosLargeFileWarning}</div>
        ) : null}

        {/* Bulk action bar */}
        <div className="xfer-bulk-bar">
          <span className="xfer-bulk-count">
            {allTransfers.length === 0
              ? "No files"
              : allTransfers.length === 1
                ? "1 file"
                : `${allTransfers.length} files`}
          </span>
          <div className="xfer-bulk-actions">
            {hasActiveTransfers ? (
              <button className="xfer-bulk-btn" type="button" onClick={cancelAllTransfers}>
                Cancel all
              </button>
            ) : null}
            {hasAnyFailed ? (
              <button className="xfer-bulk-btn" type="button" onClick={removeFailedItems}>
                Clear failed
              </button>
            ) : null}
            {hasAnyCompleted ? (
              <button
                className="xfer-bulk-btn"
                type="button"
                onClick={() => {
                  // Remove only completed items
                  for (const item of allTransfers) {
                    if (item.status === "complete") {
                      dispatch({ type: "transfer:remove", id: item.id });
                    }
                  }
                }}
              >
                Clear completed
              </button>
            ) : null}
            {allDoneOrFailed && allTransfers.length > 0 ? (
              <button className="xfer-bulk-btn" type="button" onClick={clearAllItems}>
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        <div className="xfer-pool">
          {allTransfers.length === 0 ? (
            <div className="xfer-pool-empty">
              <p className="xfer-pool-empty-title">
                {isSessionExpired
                  ? "Session expired"
                  : canSendFiles
                    ? "No files yet"
                    : lastDataChannelMessage}
              </p>
              <p className="xfer-pool-empty-sub">
                {isSessionExpired
                  ? "Start a new session to transfer more files."
                  : hasChannelIssue
                    ? getChannelIssueMessage(state)
                    : canSendFiles
                      ? dragActive
                        ? "Release to send"
                        : 'Drop files anywhere or tap "Choose files" to send.'
                      : channelFootnote}
              </p>
              {isSessionExpired ? (
                <button
                  className="button"
                  type="button"
                  style={{ marginTop: 16 }}
                  onClick={() => navigate("/")}
                >
                  Start new session
                </button>
              ) : null}
            </div>
          ) : (
            <div className="xfer-pool-list">
              {allTransfers.map((item) => {
                const previewUrl = getPreviewUrl(item);
                const speed = speedMap[item.id];
                const eta = etaMap[item.id];
                return (
                  <FileRow
                    key={item.id}
                    item={item}
                    localLabel={localLabel}
                    peerLabel={peerLabel}
                    previewUrl={previewUrl}
                    downloaded={downloadedIds.has(item.id)}
                    onDownload={() => markDownloaded(item)}
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
                    onRemove={removeItem}
                    speedBps={speed}
                    etaSeconds={eta}
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
              : isSessionExpired
                ? "Session expired"
                : state.dataChannel === "open"
                  ? "Securing…"
                  : "Connecting…"}
          </button>
          {hasAnyFailed ? (
            <button
              className="button secondary xfer-sendbar-clear"
              type="button"
              onClick={removeFailedItems}
            >
              Clear failed
            </button>
          ) : null}
          {state.dataChannel === "open" && state.crypto === "ready" && !isSessionExpired ? (
            <div className="xfer-file-counter">
              <div className="xfer-file-counter-track">
                <div
                  className={`xfer-file-counter-fill${localLimitReached ? " xfer-file-counter-fill--full" : ""}`}
                  style={{ width: `${Math.min(100, (completedCount / maxFiles) * 100)}%` }}
                />
              </div>
              <span className="xfer-file-counter-label">
                {completedCount}/{maxFiles}
              </span>
            </div>
          ) : null}
        </footer>
      </main>
    </AppShell>
  );
}

function getFileType(
  name: string,
): "image" | "video" | "audio" | "pdf" | "archive" | "code" | "file" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (/^(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif|heic)$/.test(ext)) return "image";
  if (/^(mp4|mov|avi|mkv|webm|m4v|flv)$/.test(ext)) return "video";
  if (/^(mp3|wav|ogg|flac|aac|m4a|opus|wma)$/.test(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (/^(zip|tar|gz|bz2|rar|7z|tgz|xz)$/.test(ext)) return "archive";
  if (
    /^(js|ts|jsx|tsx|py|go|rs|java|c|cpp|h|cs|rb|php|html|css|json|xml|yaml|yml|toml|sh|md|txt|csv)$/.test(
      ext,
    )
  )
    return "code";
  return "file";
}

function getIssueMessage(issue: FileIssue | undefined, fallback: string): string {
  switch (issue) {
    case "file_too_large":
      if (/iPhone Safari/i.test(fallback)) {
        return fallback;
      }
      return "This file is too large for the current limit. Remove it or choose a smaller file.";
    case "too_many_files":
      return "This transfer has too many files. Choose fewer files and try again.";
    case "transfer_too_large":
      return "This session has reached the current transfer size limit. Start a new session or choose fewer files.";
    case "unsupported_file":
    case "browser_limit":
      return "This file type or size hit a browser limit. iPhone Safari can be unstable around 1 GB or larger; try a smaller file or send from a desktop browser.";
    case "connection_lost":
      if (/locked|offline|changed networks|data channel closed/i.test(fallback)) {
        return `${fallback} On iPhone, keep Safari open and the screen unlocked until the transfer finishes.`;
      }
      return "Connection lost during transfer. Keep both devices open and try again. On iPhone, keep Safari open and the screen unlocked.";
    case "peer_disconnected":
      return "The other device left the session.";
    case "transfer_failed":
    case "unknown":
      return "Something went wrong during transfer. You can retry or start a new session.";
    case "cancelled":
      return "Transfer cancelled.";
    default:
      return fallback;
  }
}

function isLikelyIosSafari(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent;
  const platform = navigator.platform;
  const iOS =
    /iPad|iPhone|iPod/i.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webKit = /WebKit/i.test(ua);
  const nonSafariShell = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return iOS && webKit && !nonSafariShell;
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
        <rect x="4" y="2" width="48" height="34" rx="3" />
        <circle cx="28" cy="7" r="1.5" fill={stroke} stroke="none" />
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
        <line x1="28" y1="38" x2="28" y2="48" />
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
        <rect x="3" y="2" width="38" height="64" rx="5" />
        <circle cx="22" cy="8" r="2" fill={stroke} stroke="none" />
        <circle cx="22" cy="60" r="3" />
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
  return (
    <svg
      className="xfer-device-svg xfer-device-svg--tall"
      viewBox="0 0 36 68"
      aria-hidden="true"
      {...common}
    >
      <rect x="2" y="2" width="32" height="64" rx="7" />
      <rect x="12" y="9" width="12" height="4" rx="2" fill={stroke} stroke="none" />
      <rect x="11" y="57" width="14" height="3" rx="1.5" fill={stroke} stroke="none" />
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

  if (type === "image")
    return (
      <svg {...s} style={style} className={`xfer-filetype xfer-filetype--${type}`}>
        <rect x="3" y="3" width="26" height="26" rx="3" />
        <circle cx="11" cy="12" r="2.5" />
        <path d="M3 23 l8-8 5 5 4-4 9 9" />
      </svg>
    );
  if (type === "video")
    return (
      <svg {...s} style={style} className={`xfer-filetype xfer-filetype--${type}`}>
        <rect x="2" y="6" width="20" height="20" rx="3" />
        <path d="M22 12 l8-4v16l-8-4V12z" />
      </svg>
    );
  if (type === "audio")
    return (
      <svg {...s} style={style} className={`xfer-filetype xfer-filetype--${type}`}>
        <circle cx="16" cy="16" r="13" />
        <circle cx="16" cy="16" r="4" />
        <path d="M16 3a13 13 0 0 1 9.2 22.2" />
      </svg>
    );
  if (type === "pdf")
    return (
      <svg {...s} style={style} className={`xfer-filetype xfer-filetype--${type}`}>
        <path d="M6 2h14l8 8v20H6V2z" />
        <path d="M20 2v8h8" />
        <path d="M9 17h6M9 21h10M9 25h4" />
      </svg>
    );
  if (type === "archive")
    return (
      <svg {...s} style={style} className={`xfer-filetype xfer-filetype--${type}`}>
        <rect x="3" y="12" width="26" height="18" rx="2" />
        <path d="M3 12 L8 2h16l5 10" />
        <line x1="13" y1="2" x2="13" y2="12" />
        <line x1="19" y1="2" x2="19" y2="12" />
        <rect x="12" y="18" width="8" height="5" rx="1" />
      </svg>
    );
  if (type === "code")
    return (
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

function FileRow({
  item,
  localLabel,
  peerLabel,
  previewUrl,
  downloaded,
  onDownload,
  onOpenLightbox,
  onCancel,
  onRetry,
  onRemove,
  speedBps,
  etaSeconds,
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
  onRemove: (id: string) => void;
  speedBps: number | undefined;
  etaSeconds: number | undefined;
}) {
  const pct = Math.round(item.progress * 100);
  const done = item.status === "complete";
  const failed = item.status === "failed" || item.status === "rejected";
  const canceled = item.status === "canceled";
  const offered =
    item.status === "offered" || item.status === "accepted" || item.status === undefined;
  const active = item.status === "transferring";
  const isIncoming = item.direction === "incoming";
  const type = getFileType(item.name);
  const ext = item.name.split(".").pop()?.toUpperCase() ?? "";
  const canSave = done && isIncoming && item.downloadUrl !== undefined;

  const isLocalValidationError =
    item.issue === "file_too_large" ||
    item.issue === "too_many_files" ||
    item.issue === "transfer_too_large" ||
    item.issue === "unsupported_file" ||
    item.issue === "browser_limit";
  const isRetryable = !isLocalValidationError && (item.retryable ?? false);

  const errorMessage =
    failed || canceled ? getIssueMessage(item.issue, item.error ?? "Transfer failed.") : undefined;

  const fromLabel = isIncoming ? `↓ ${peerLabel}` : `↑ ${localLabel}`;

  // List row layout
  return (
    <div
      className={`xfer-row${done ? " xfer-row--done" : ""}${failed || canceled ? " xfer-row--failed" : ""}`}
    >
      <button
        className={`xfer-row-thumb xfer-thumb--${type}`}
        type="button"
        onClick={onOpenLightbox}
        aria-label={`Preview ${item.name}`}
        tabIndex={previewUrl !== undefined || done ? 0 : -1}
      >
        {previewUrl !== undefined ? (
          <img src={previewUrl} alt="" className="xfer-row-img" />
        ) : (
          <FileTypeIcon name={item.name} size={20} />
        )}
      </button>
      <div className="xfer-row-body">
        <div className="xfer-row-top">
          <span className="xfer-row-name" title={item.name}>
            {item.name}
          </span>
          <span className="xfer-row-direction">{fromLabel}</span>
        </div>
        <div className="xfer-row-bottom">
          <span className="xfer-row-size">
            {active && item.bytesTransferred !== undefined
              ? `${formatBytes(item.bytesTransferred)} / ${formatBytes(item.size)}`
              : formatBytes(item.size)}
          </span>
          {active ? <span className="xfer-row-pct">{pct}%</span> : null}
          {active && speedBps !== undefined ? (
            <span className="xfer-row-speed">
              {formatSpeed(speedBps)}
              {etaSeconds !== undefined ? ` · ${formatEta(etaSeconds)}` : ""}
            </span>
          ) : null}
          {done ? <span className="xfer-row-status xfer-row-status--done">Complete</span> : null}
          {failed ? <span className="xfer-row-status xfer-row-status--fail">Failed</span> : null}
          {canceled ? (
            <span className="xfer-row-status xfer-row-status--canceled">Cancelled</span>
          ) : null}
          {offered && !active ? (
            <span className="xfer-row-status xfer-row-status--queued">Queued</span>
          ) : null}
        </div>
        {(active || offered) && !done && !failed && !canceled ? (
          <div className="xfer-row-bar">
            <div className="xfer-row-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {errorMessage !== undefined ? <div className="xfer-row-error">{errorMessage}</div> : null}
      </div>
      <div className="xfer-row-actions">
        {canSave ? (
          <a
            className={`xfer-row-save${downloaded ? " xfer-row-save--saved" : ""}`}
            href={item.downloadUrl}
            download={item.name}
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            {downloaded ? "✓" : "↓ Save"}
          </a>
        ) : null}
        {active || offered ? (
          <button
            className="xfer-row-btn xfer-row-btn--cancel"
            type="button"
            onClick={() => onCancel(item.id, item.fileId)}
            aria-label="Cancel"
          >
            ×
          </button>
        ) : null}
        {done ? (
          <button className="xfer-row-btn" type="button" onClick={() => onRemove(item.id)}>
            Dismiss
          </button>
        ) : null}
        {failed || canceled ? (
          <button className="xfer-row-btn" type="button" onClick={() => onRemove(item.id)}>
            Remove
          </button>
        ) : null}
        {failed && isRetryable ? (
          <button
            className="xfer-row-btn xfer-row-btn--retry"
            type="button"
            onClick={() => onRetry(item.id)}
          >
            Retry
          </button>
        ) : null}
      </div>
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
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="xfer-lightbox"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${name}`}
    >
      <button className="xfer-lightbox-close" type="button" onClick={onClose} aria-label="Close">
        ×
      </button>

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

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 5) return "almost done";
  if (seconds < 60) return `about ${seconds}s left`;
  const mins = Math.ceil(seconds / 60);
  return `about ${mins}m left`;
}

function formatSessionTimer(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getConnectionLabel(
  state: ClientSessionState,
  canSendFiles: boolean,
  hasChannelIssue: boolean,
  networkType: "local" | "relay" | "unknown",
): string {
  if (canSendFiles) {
    if (networkType === "local") return "◉ Direct";
    if (networkType === "relay") return "◌ Relay";
    return "Connected";
  }
  if (hasChannelIssue) return "Connection issue";
  if (state.dataChannel === "open") return "Securing…";
  return "Connecting…";
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

function createTransferAnalyticsState(
  fileCount: number,
  totalBytes: number,
): TransferAnalyticsState {
  return {
    fileCount,
    totalBytes,
    completedBytes: 0,
    startedAt: Date.now(),
    completed: false,
    failed: false,
    startedFileIds: new Set(),
    completedFileIds: new Set(),
    failedFileIds: new Set(),
  };
}

function toAnalyticsConnectionType(networkType: "local" | "relay" | "unknown"): string {
  if (networkType === "local") return "direct";
  if (networkType === "relay") return "relayed";
  return "unknown";
}

function failureStageForIssue(issue: string): string {
  if (issue === "connection_lost" || issue === "peer_disconnected" || issue === "webrtc_failed") {
    return "connection";
  }
  if (
    issue === "file_too_large" ||
    issue === "too_many_files" ||
    issue === "transfer_too_large" ||
    issue === "unsupported_file" ||
    issue === "browser_limit" ||
    issue === "cancelled" ||
    issue === "cancelled_all" ||
    issue === "start_failed"
  ) {
    return "validation";
  }
  return "file_assemble";
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
