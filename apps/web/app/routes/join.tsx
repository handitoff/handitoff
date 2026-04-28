import type { Route } from "./+types/join";
import { useEffect, useReducer, useRef } from "react";
import { useNavigate } from "react-router";
import { AppShell } from "../components/app-shell";
import { HanditoffApiClient, ApiClientError } from "../lib/api-client";
import { getBrowserDeviceIdentity } from "../lib/device";
import { initialClientSessionState, reduceClientSessionState } from "../lib/session-store";
import { loadPublicRuntimeConfig } from "../lib/runtime-config";
import { HanditoffWebSocketClient } from "../lib/websocket-client";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Join ${params.code} - handitoff.io` }];
}

export default function Join({ params }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(reduceClientSessionState, initialClientSessionState);
  const socketRef = useRef<HanditoffWebSocketClient | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    const publicCode = params.code.toUpperCase();
    const identity = getBrowserDeviceIdentity();
    const initialConfig = loadPublicRuntimeConfig();
    const api = new HanditoffApiClient({ baseUrl: initialConfig.apiUrl });

    dispatch({ type: "session:join-start", publicCode, deviceId: identity.id, deviceLabel: identity.label });
    dispatch({ type: "socket:connecting" });

    void api
      .getSession(publicCode, { signal: controller.signal })
      .then(() => api.getConfig({ signal: controller.signal }).catch(() => initialConfig))
      .then((config) => {
        if (controller.signal.aborted) {
          return;
        }

        const socket = new HanditoffWebSocketClient(config.wsUrl);
        socketRef.current = socket;

        socket.onStatus((status) => {
          dispatch(status === "connected" ? { type: "socket:connected" } : { type: "socket:disconnected" });
          if (status === "connected") {
            socket.send({
              type: "session:join",
              publicCode,
              deviceId: identity.id,
              deviceLabel: identity.label,
            });
          }
        });

        socket.onMessage((message) => {
          if (message.type === "session:join-request") {
            dispatch({ type: "session:join-requested", sessionId: message.sessionId });
            return;
          }

          if (message.type === "session:joined") {
            dispatch({
              type: "session:paired",
              sessionId: message.sessionId,
              peerDeviceId: message.peerDeviceId,
              peerDeviceLabel: message.peerDeviceLabel,
            });
            window.sessionStorage.setItem("handitoff.connectedPeerLabel", message.peerDeviceLabel);
            window.sessionStorage.setItem("handitoff.connectedCode", publicCode);
            navigate(`/s/${publicCode}`);
            return;
          }

          if (message.type === "session:rejected") {
            dispatch({ type: "session:rejected", message: "The host rejected this pairing request." });
            return;
          }

          if (message.type === "session:expired") {
            dispatch({ type: "session:expired" });
            return;
          }

          if (message.type === "session:ended") {
            dispatch({ type: "session:ended" });
            return;
          }

          if (message.type === "error") {
            const messageText =
              message.code === "session_expired"
                ? "This session has expired."
                : message.code === "session_not_found"
                  ? "This session was not found."
                  : message.message;
            if (message.code === "session_expired") {
              dispatch({ type: "session:expired" });
              return;
            }
            dispatch({ type: "session:error", message: messageText });
          }
        });

        socket.connect();
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (error instanceof ApiClientError && error.code === "session_expired") {
          dispatch({ type: "session:expired" });
          return;
        }
        dispatch({
          type: "session:error",
          message:
            error instanceof ApiClientError && error.code === "session_not_found"
              ? "This session was not found."
              : error instanceof Error
                ? error.message
                : "Could not join this session.",
        });
      });

    return () => {
      controller.abort();
      socketRef.current?.close();
      socketRef.current = undefined;
    };
  }, [navigate, params.code]);

  const title =
    state.connection === "error"
      ? "No match."
      : state.connection === "expired"
        ? "Expired."
        : state.connection === "rejected"
          ? "Not this time."
          : "Hold still...";
  const body =
    state.connection === "error" || state.connection === "rejected"
      ? state.error
      : state.connection === "expired"
        ? "This code is no longer active. Start a new session on the other device."
        : `Asking the desktop to open a private channel for code ${params.code.toUpperCase()}.`;
  const status =
    state.connection === "joining" || state.websocket === "connecting"
      ? "Connecting"
      : state.connection === "rejected"
        ? "Rejected"
        : state.connection === "expired"
          ? "Expired"
          : state.connection === "error"
            ? "Could not join"
            : "Waiting for approval";

  return (
    <AppShell>
      <main className="mobile-flow">
        <div className="mobile-card">
          <div className="section-label">No. 001 - Handshake</div>
          <h1 className="mobile-title">
            {title}
          </h1>
          <p>{body}</p>
          <div className="status-line">
            {state.connection === "joining" || state.connection === "idle" ? (
              <span className="spinner" aria-hidden="true" />
            ) : null}
            <span>{status}</span>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
