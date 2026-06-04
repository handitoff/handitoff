import { useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { Plus, X } from "lucide-react";
import { VisualQr } from "../visual-qr";
import { getBrowserDeviceIdentity } from "../../lib/device";
import { loadPublicRuntimeConfig } from "../../lib/runtime-config";
import { HanditoffWebSocketClient } from "../../lib/websocket-client";

// ─────────────────────────────────────────────────────────────────────────────
// Floating "New handoff" ticket. This uses the live signaling API so account
// sessions are real handoff sessions, not a second mock flow.
// ─────────────────────────────────────────────────────────────────────────────

export function NewHandoffTicket({ deviceName }: { deviceName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-zinc-50 pl-3 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-950 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        New handoff
      </button>

      {open && <NewHandoffOverlay deviceName={deviceName} onClose={() => setOpen(false)} />}
    </>
  );
}

function NewHandoffOverlay({ deviceName, onClose }: { deviceName: string; onClose: () => void }) {
  const navigate = useNavigate();
  const identity = useMemo(() => getBrowserDeviceIdentity(), []);
  const socketRef = useRef<HanditoffWebSocketClient | undefined>(undefined);
  const sessionRef = useRef<{ sessionId?: string; publicCode?: string; peerLabel?: string }>({});
  const [code, setCode] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [pendingPeer, setPendingPeer] = useState<{ id: string; label: string }>();
  const [status, setStatus] = useState<"connecting" | "waiting" | "pairing" | "error">(
    "connecting",
  );
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<"link" | "code" | undefined>(undefined);

  useEffect(() => {
    sessionRef.current = { ...sessionRef.current, sessionId, publicCode: code };
  }, [code, sessionId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    const config = loadPublicRuntimeConfig();
    const socket = new HanditoffWebSocketClient(config.wsUrl);
    socketRef.current = socket;

    socket.onStatus((nextStatus, reason) => {
      if (nextStatus === "connected") {
        socket.send({
          type: "session:create",
          deviceId: identity.id,
          deviceLabel: deviceName,
        });
        return;
      }
      if (reason !== undefined) {
        setError(reason);
        setStatus("error");
      }
    });

    socket.onMessage((message) => {
      if (message.type === "session:created") {
        sessionRef.current = {
          sessionId: message.sessionId,
          publicCode: message.publicCode,
        };
        setSessionId(message.sessionId);
        setCode(message.publicCode);
        setJoinUrl(message.joinUrl);
        setStatus("waiting");
        return;
      }

      if (message.type === "session:join-request") {
        const peer = { id: message.peerDeviceId, label: message.peerDeviceLabel };
        sessionRef.current = { ...sessionRef.current, peerLabel: peer.label };
        setPendingPeer(peer);
        setStatus("pairing");
        return;
      }

      if (message.type === "peer:connected") {
        const current = sessionRef.current;
        const peerLabel = current.peerLabel ?? "Paired device";
        window.sessionStorage.setItem("handitoff.sessionId", current.sessionId ?? "");
        window.sessionStorage.setItem("handitoff.deviceId", identity.id);
        window.sessionStorage.setItem("handitoff.deviceLabel", deviceName);
        window.sessionStorage.setItem("handitoff.peerDeviceId", message.peerDeviceId);
        window.sessionStorage.setItem("handitoff.connectedPeerLabel", peerLabel);
        window.sessionStorage.setItem("handitoff.connectedCode", current.publicCode ?? "");
        window.sessionStorage.setItem("handitoff.role", "host");
        if (message.limits !== undefined) {
          window.sessionStorage.setItem("handitoff.sessionLimits", JSON.stringify(message.limits));
        }
        navigate(`/s/${current.publicCode ?? ""}`);
        return;
      }

      if (message.type === "session:expired" || message.type === "session:ended") {
        setStatus("error");
        setError("This waiting handoff ended. Start a new one to continue.");
        return;
      }

      if (message.type === "error") {
        setStatus("error");
        setError(message.message);
      }
    });

    try {
      socket.connect();
    } catch (connectError) {
      setStatus("error");
      setError(connectError instanceof Error ? connectError.message : "Could not start handoff.");
    }

    const presenceInterval = window.setInterval(() => {
      const current = sessionRef.current;
      if (current.sessionId === undefined) return;
      try {
        socket.send({
          type: "presence:ping",
          sessionId: current.sessionId,
          deviceId: identity.id,
        });
      } catch {
        // Socket status updates handle reconnect/error UI.
      }
    }, 10_000);

    return () => {
      window.clearInterval(presenceInterval);
      const current = sessionRef.current;
      if (current.sessionId !== undefined) {
        try {
          socket.send({
            type: "session:end",
            sessionId: current.sessionId,
            deviceId: identity.id,
          });
        } catch {
          // The session will expire if the socket is already gone.
        }
      }
      socket.close();
      socketRef.current = undefined;
    };
  }, [deviceName, identity.id, navigate]);

  const copy = useCallback((kind: "link" | "code", value: string) => {
    if (value === "") return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(kind);
      window.setTimeout(() => setCopied(undefined), 1600);
    });
  }, []);

  const approvePeer = () => {
    if (sessionId === undefined || pendingPeer === undefined) return;
    socketRef.current?.send({
      type: "session:approve-peer",
      sessionId,
      deviceId: identity.id,
      peerDeviceId: pendingPeer.id,
    });
  };

  const rejectPeer = () => {
    if (sessionId === undefined || pendingPeer === undefined) return;
    socketRef.current?.send({
      type: "session:reject-peer",
      sessionId,
      deviceId: identity.id,
      peerDeviceId: pendingPeer.id,
    });
    setPendingPeer(undefined);
    setStatus("waiting");
  };

  const statusLabel =
    status === "connecting"
      ? "Starting"
      : status === "pairing"
        ? "Approval needed"
        : status === "error"
          ? "Unavailable"
          : "Live";

  // Portal to <body>: ancestors in the account layout use backdrop-blur, which
  // turns `position: fixed` into containment — without the portal the overlay is
  // clipped to the sticky tab bar instead of covering the viewport.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New handoff"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 overflow-y-auto bg-zinc-950/85 px-5 py-12 backdrop-blur-md"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss handoff"
        className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/80 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          New handoff
        </p>
        <h2 className="font-display text-xl leading-none tracking-tight text-zinc-50 lowercase md:text-2xl">
          hand a file off.
        </h2>
      </div>

      {/* Brand ticket — same surface as the homepage hero. */}
      <div className="l-ticket-wrap">
        <div className="l-ticket-shadow">
          <div className="l-ticket" role="region" aria-label="Session ticket">
            <div className="l-ticket-perf" aria-hidden="true" />

            <div className="l-ticket-body">
              <div className="l-ticket-head">
                <span className="l-ticket-code">Waiting for a device</span>
                <span className="l-ticket-status" aria-live="polite">
                  <span className="l-ticket-status-dot" aria-hidden="true" />
                  {statusLabel}
                </span>
              </div>

              <h3 className="l-ticket-title l-ticket-title--code">{code || "-----"}</h3>

              <div className="l-ticket-from-to">
                <div className="l-ticket-from">
                  <div className="l-ticket-ft-label">From</div>
                  <div className="l-ticket-ft-value">{deviceName}</div>
                </div>
                <div className="l-ticket-arrow">&rarr;</div>
                <div className="l-ticket-to">
                  <div className="l-ticket-ft-label">To</div>
                  <div className="l-ticket-ft-value l-ticket-ft-value--muted">
                    {pendingPeer?.label ?? "Awaiting scan"}
                    <span className="l-blink" aria-hidden="true">
                      _
                    </span>
                  </div>
                </div>
              </div>

              <div className="l-ticket-foot" role="group" aria-label="Session actions">
                <button
                  className="l-ticket-btn"
                  type="button"
                  onClick={() => copy("link", joinUrl)}
                  disabled={joinUrl === ""}
                >
                  {copied === "link" ? "Copied ✓" : "Copy link"}
                </button>
                <button
                  className="l-ticket-btn l-ticket-btn--secondary"
                  type="button"
                  onClick={() => copy("code", code)}
                  disabled={code === ""}
                >
                  {copied === "code" ? "Copied ✓" : "Copy code"}
                </button>
              </div>
            </div>

            <div className="l-ticket-stub">
              <div className="l-ticket-stub-head">Scan to pair</div>
              <div className="l-ticket-stub-mid">
                <div className="l-ticket-qr-frame">
                  <VisualQr size={160} value={joinUrl || "https://handitoff.io"} />
                  <div className="l-ticket-scan-line" aria-hidden="true" />
                </div>
              </div>
              <div className="l-ticket-stub-foot">handitoff.io/join</div>
            </div>
          </div>
        </div>
      </div>

      {pendingPeer !== undefined ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className="l-ticket-btn" onClick={approvePeer}>
            Approve {pendingPeer.label}
          </button>
          <button
            type="button"
            className="l-ticket-btn l-ticket-btn--secondary"
            onClick={rejectPeer}
          >
            Reject
          </button>
        </div>
      ) : (
        <p className="max-w-md text-center text-sm leading-relaxed text-zinc-400">
          {error ??
            "Share the link or code. When a device joins, you'll approve it and move into the live session. Closing this ends the waiting handoff."}
        </p>
      )}
    </div>,
    document.body,
  );
}
