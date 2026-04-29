import type { Route } from "./+types/session";
import {
  deriveAesGcmKey,
  exportEcdhPublicKey,
  generateEcdhKeyPair,
  importEcdhPublicKey,
  type EcdhKeyPair,
} from "@handitoff/crypto";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AppShell } from "../components/app-shell";
import {
  initialClientSessionState,
  reduceClientSessionState,
  type ClientSessionState,
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
  const keyPairRef = useRef<EcdhKeyPair | undefined>(undefined);
  const aesKeyRef = useRef<CryptoKey | undefined>(undefined);
  const pendingPeerPublicKeyRef = useRef<JsonWebKey | undefined>(undefined);
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
    keyPairRef.current = undefined;
    aesKeyRef.current = undefined;
    pendingPeerPublicKeyRef.current = undefined;
  }, []);

  const sendSignal = useCallback((message: Parameters<HanditoffWebSocketClient["send"]>[0]) => {
    socketRef.current?.send(message);
  }, []);

  const sendLocalPublicKey = useCallback(
    async (keyPair: EcdhKeyPair) => {
      const current = stateRef.current;
      if (current.sessionId === undefined || current.deviceId === undefined) {
        return;
      }

      sendSignal({
        type: "crypto:public-key",
        sessionId: current.sessionId,
        fromDeviceId: current.deviceId,
        publicKey: await exportEcdhPublicKey(keyPair.publicKey),
      });
    },
    [sendSignal],
  );

  const completeCryptoExchange = useCallback(async (peerPublicKey: JsonWebKey) => {
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
  }, []);

  const startCryptoExchange = useCallback(async () => {
    keyPairRef.current = undefined;
    aesKeyRef.current = undefined;
    pendingPeerPublicKeyRef.current = undefined;
    dispatch({ type: "crypto:generating" });

    const keyPair = await generateEcdhKeyPair();
    keyPairRef.current = keyPair;
    dispatch({ type: "crypto:exchanging" });
    await sendLocalPublicKey(keyPair);

    const pendingPeerPublicKey = pendingPeerPublicKeyRef.current;
    if (pendingPeerPublicKey !== undefined) {
      await completeCryptoExchange(pendingPeerPublicKey);
    }
  }, [completeCryptoExchange, sendLocalPublicKey]);

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
        peerRef.current?.sendJson({ type: "connection:ping", sentAt: Date.now() });
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
            peerRef.current?.sendJson({ type: "connection:pong", receivedAt: Date.now() });
            setLastDataChannelMessage("Ready");
            return;
          }
          if (parsed?.type === "connection:pong") {
            setLastDataChannelMessage("Ready");
            return;
          }
        }
        setLastDataChannelMessage("Message received");
        return;
      }
      if (event.type === "failed") {
        dispatch({ type: "webrtc:failed", message: event.message });
      }
    },
    [sendSignal],
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
        dispatch({
          type: "crypto:failed",
          message: error instanceof Error ? error.message : "Could not start secure transfer.",
        });
      });
    },
    [handlePeerEvent, startCryptoExchange, teardownPeer],
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
              dispatch({
                type: "crypto:failed",
                message:
                  error instanceof Error ? error.message : "Could not finish secure transfer.",
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
  }, [createPeer, navigate, params.code, retryKey, teardownPeer]);

  const chooseFiles = () => inputRef.current?.click();
  const readFiles = (files: FileList | null) => {
    setChosenFiles(files === null ? [] : Array.from(files));
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

  const connectionLabel =
    state.webrtc === "connected" && state.dataChannel === "open" && state.crypto === "ready"
      ? "Secure transfer ready"
      : state.webrtc === "connected" && state.dataChannel === "open"
        ? "Securing transfer"
        : state.webrtc === "failed" || state.dataChannel === "failed"
          ? "Direct channel not ready"
          : "Opening direct channel";
  const canSendFiles = state.dataChannel === "open" && state.crypto === "ready";
  const peerLabel = state.peerDeviceLabel ?? "Paired device";
  const retryHint = isLocalDevelopment()
    ? "The local browser channel did not finish opening. Retry restarts the browser connection without creating a new pairing code."
    : configRef.current.features.turnEnabled
      ? "Retry can request a fresh direct path."
      : "Some restricted networks can block direct browser transfers. Retry first; TURN relay support is configured separately for production deployments.";

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
          <div className="section-label">No. 002 - Channel open</div>
          <h1 className="display-title">
            Drop
            <br />
            anything.
          </h1>
          <p className="lede">
            Files dropped here will appear on the paired device. Photos, archives, documents,
            anything you need to hand off.
          </p>
          {state.webrtc === "failed" ? <p className="lede">{retryHint}</p> : null}
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
            {state.webrtc === "failed" ||
            state.dataChannel === "failed" ||
            state.crypto === "failed" ? (
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
            <span>Connected</span>
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
            <div className="progress-row">
              <div
                className="progress-fill"
                style={{
                  width: canSendFiles ? "100%" : state.dataChannel === "open" ? "70%" : "35%",
                }}
              />
              <span>01 Outbound</span>
              <span>{chosenFiles.length === 0 ? "Empty" : `${chosenFiles.length} ready`}</span>
            </div>
            <div className="progress-row">
              <div
                className="progress-fill"
                style={{ width: state.crypto === "ready" ? "100%" : "0%" }}
              />
              <span>02 Inbound</span>
              <span>{lastDataChannelMessage}</span>
            </div>
          </div>
          <div className="panel-foot">
            <span>
              {state.websocket === "connected" ? "Signaling connected" : "Signaling offline"}
            </span>
            <span>{state.crypto === "ready" ? "secure" : state.dataChannel}</span>
          </div>
        </aside>
      </main>
    </AppShell>
  );
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

function parseDataChannelControlMessage(value: string): { type: string } | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      typeof parsed.type === "string"
    ) {
      return { type: parsed.type };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isLocalDevelopment(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1"
  );
}
