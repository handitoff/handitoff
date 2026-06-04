import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router";
import { AccountMenu } from "../components/account-menu";
import { VisualQr } from "../components/visual-qr";
import type { CSSProperties } from "react";
import { getBrowserDeviceIdentity } from "../lib/device";
import {
  initialClientSessionState,
  reduceClientSessionState,
  type ClientSessionState,
} from "../lib/session-store";
import { loadPublicRuntimeConfig } from "../lib/runtime-config";
import { seoMeta } from "../lib/seo";
import { HanditoffWebSocketClient } from "../lib/websocket-client";
import { trackEvent } from "../lib/analytics";

const DeferredLanding = lazy(() => import("../components/home-deferred"));

export function meta() {
  return seoMeta({
    title: "Transfer files between devices instantly | handitoff",
    description:
      "Move files between your phone, laptop, tablet, or PC directly from your browser. No install, no account, no cloud uploads.",
    path: "/",
    image: "https://handitoff.io/og.png",
    ogTitle: "handitoff — AirDrop, but in your browser",
    ogDescription:
      "Move files between devices instantly. No install. No account. No cloud uploads.",
    twitterTitle: "handitoff — AirDrop, but in your browser",
    twitterDescription:
      "Move files between devices instantly. No install. No account. No cloud uploads.",
  });
}

// ── Hero atmosphere helpers ──────────────────────────────────────────────────

function rand(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const STAR_ITEMS = Array.from({ length: 140 }, (_, i) => ({
  x: rand(i * 2 + 1) * 100,
  y: rand(i * 2 + 2) * 76,
  r: Math.max(1, Math.round(rand(i * 3 + 3) * 2.5)),
  op: rand(i * 5 + 4) * 0.55 + 0.35,
}));

function HeroStars() {
  return (
    <div className="l-stars" aria-hidden="true">
      {STAR_ITEMS.map((s, i) => (
        <div
          key={i}
          className="l-star"
          style={
            {
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.r * 2,
              height: s.r * 2,
              opacity: s.op,
              ["--star-op" as string]: s.op,
              animationDuration: `${3 + (i % 5)}s`,
              animationDelay: `${-(i % 7)}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function HeroGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | undefined>(undefined);
  const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (cleanupTimeoutRef.current !== undefined) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = undefined;
    }
    if (workerRef.current !== undefined) return;

    const canvas = canvasRef.current;
    if (!canvas || !canvas.transferControlToOffscreen) return;

    const offscreen = canvas.transferControlToOffscreen();
    const worker = new Worker(new URL("../lib/globe-worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.postMessage({ canvas: offscreen }, [offscreen]);

    return () => {
      cleanupTimeoutRef.current = setTimeout(() => {
        workerRef.current?.terminate();
        workerRef.current = undefined;
        cleanupTimeoutRef.current = undefined;
      }, 0);
    };
  }, []);

  return (
    <div className="l-globe-wrap" aria-hidden="true">
      <canvas ref={canvasRef} width={512} height={512} className="l-globe-canvas" />
    </div>
  );
}

function useIdleMount(ready: boolean) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!ready) {
      setMounted(false);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;

    const mount = () => setMounted(true);

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(mount, { timeout: 500 });
    } else {
      timeoutId = globalThis.setTimeout(mount, 120);
    }

    return () => {
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId);
      }
      if (idleId !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [ready]);

  return mounted;
}

// ────────────────────────────────────────────────────────────────────────────

function LNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`l-nav-bar${scrolled ? " l-nav-bar--scrolled" : ""}`}>
      <Link to="/" className="l-hero-wordmark" aria-label="handitoff home">
        handitoff
      </Link>
      <nav className="l-nav-right" aria-label="Main">
        <Link to="/privacy" className="l-nav-link l-nav-link--ancillary">
          Privacy
        </Link>
        <Link to="/pricing" className="l-nav-link l-nav-link--ancillary max-md:hidden!">
          Pricing
        </Link>
        <AccountMenu />
      </nav>
    </header>
  );
}

export default function Home() {
  const showDeferredLanding = useIdleMount(true);

  return (
    <div className="landing">
      <LNav />
      <LHero />
      {showDeferredLanding && (
        <Suspense fallback={null}>
          <DeferredLanding />
        </Suspense>
      )}
    </div>
  );
}

function LHero() {
  const navigate = useNavigate();
  const [restartKey] = useState(0);
  const [state, dispatch] = useReducer(reduceClientSessionState, initialClientSessionState);
  const [joinUrl, setJoinUrl] = useState("");
  const [publicCode, setPublicCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | undefined>();
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const socketRef = useRef<HanditoffWebSocketClient | undefined>(undefined);
  const stateRef = useRef<ClientSessionState>(state);
  const showGlobe = useIdleMount(publicCode !== "");

  stateRef.current = state;

  useEffect(() => {
    if (expiresAt === undefined) {
      setRemainingSeconds(0);
      return;
    }

    const update = () =>
      setRemainingSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);

  useEffect(() => {
    const controller = new AbortController();
    const identity = getBrowserDeviceIdentity();
    const initialConfig = loadPublicRuntimeConfig();

    dispatch({ type: "session:create-start", deviceId: identity.id, deviceLabel: identity.label });
    dispatch({ type: "socket:connecting" });
    setJoinUrl("");
    setPublicCode("");
    setExpiresAt(undefined);
    setCopied(false);
    setCodeCopied(false);

    try {
      const socket = new HanditoffWebSocketClient(initialConfig.wsUrl);
      socketRef.current = socket;

      socket.onStatus((status, reason) => {
        dispatch(
          status === "connected"
            ? { type: "socket:connected" }
            : { type: "socket:disconnected", reason },
        );
        if (status === "connected") {
          socket.send({
            type: "session:create",
            deviceId: identity.id,
            deviceLabel: identity.label,
          });
        }
      });

      socket.onMessage((message) => {
        if (message.type === "session:created") {
          dispatch({
            type: "session:created",
            sessionId: message.sessionId,
            publicCode: message.publicCode,
          });
          setJoinUrl(message.joinUrl);
          setPublicCode(message.publicCode);
          setExpiresAt(message.expiresAt);
          trackEvent("session_created", undefined, { sessionId: message.sessionId });
          trackEvent("session_qr_visible", undefined, { sessionId: message.sessionId });
          return;
        }

        if (message.type === "session:join-request") {
          dispatch({
            type: "session:join-request-received",
            sessionId: message.sessionId,
            peerDeviceId: message.peerDeviceId,
            peerDeviceLabel: message.peerDeviceLabel,
          });
          return;
        }

        if (message.type === "peer:connected") {
          const current = stateRef.current;
          const peerLabel = current.pendingPeerDeviceLabel ?? "Paired device";
          dispatch({
            type: "session:paired",
            sessionId: current.sessionId ?? "",
            peerDeviceId: message.peerDeviceId,
            peerDeviceLabel: peerLabel,
            role: "host",
          });
          window.sessionStorage.setItem("handitoff.sessionId", current.sessionId ?? "");
          window.sessionStorage.setItem("handitoff.deviceId", current.deviceId ?? "");
          window.sessionStorage.setItem("handitoff.deviceLabel", current.deviceLabel ?? "MacBook");
          window.sessionStorage.setItem("handitoff.peerDeviceId", message.peerDeviceId);
          window.sessionStorage.setItem("handitoff.connectedPeerLabel", peerLabel);
          window.sessionStorage.setItem("handitoff.connectedCode", current.publicCode ?? "");
          window.sessionStorage.setItem("handitoff.role", "host");
          if (message.limits !== undefined) {
            window.sessionStorage.setItem(
              "handitoff.sessionLimits",
              JSON.stringify(message.limits),
            );
          }
          trackEvent("session_peer_connected", undefined, { sessionId: current.sessionId });
          navigate(`/s/${current.publicCode ?? ""}`);
          return;
        }

        if (message.type === "session:expired") {
          dispatch({ type: "session:expired" });
          trackEvent("session_expired", undefined, { sessionId: stateRef.current.sessionId });
          return;
        }

        if (message.type === "session:ended") {
          dispatch({ type: "session:ended" });
          trackEvent("session_ended", undefined, { sessionId: stateRef.current.sessionId });
          return;
        }

        if (message.type === "error") {
          dispatch({ type: "session:error", message: message.message });
        }
      });

      socket.connect();

      const presenceInterval = window.setInterval(() => {
        const current = stateRef.current;
        if (socketRef.current !== socket) {
          window.clearInterval(presenceInterval);
          return;
        }
        if (current.sessionId === undefined || current.deviceId === undefined) {
          return;
        }
        try {
          socket.send({
            type: "presence:ping",
            sessionId: current.sessionId,
            deviceId: current.deviceId,
          });
        } catch {
          // The QR/link remains valid; socket state is handled separately from session creation.
        }
      }, 10_000);

      controller.signal.addEventListener("abort", () => window.clearInterval(presenceInterval), {
        once: true,
      });
    } catch (error: unknown) {
      dispatch({
        type: "session:error",
        message: error instanceof Error ? error.message : "Could not create a session.",
      });
    }

    const handleBeforeUnload = () => {
      const current = stateRef.current;
      if (current.sessionId !== undefined && current.deviceId !== undefined) {
        socketRef.current?.send({
          type: "session:end",
          sessionId: current.sessionId,
          deviceId: current.deviceId,
        });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      controller.abort();
      socketRef.current?.close();
      socketRef.current = undefined;
    };
  }, [navigate, restartKey]);

  const countdown = useMemo(() => {
    if (remainingSeconds <= 0) {
      return "Expired";
    }
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `Expires in ${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [remainingSeconds]);

  const approvePeer = () => {
    if (
      state.sessionId === undefined ||
      state.deviceId === undefined ||
      state.pendingPeerDeviceId === undefined
    ) {
      return;
    }
    socketRef.current?.send({
      type: "session:approve-peer",
      sessionId: state.sessionId,
      deviceId: state.deviceId,
      peerDeviceId: state.pendingPeerDeviceId,
    });
    trackEvent("session_peer_approved", undefined, { sessionId: state.sessionId });
  };

  const rejectPeer = () => {
    if (
      state.sessionId === undefined ||
      state.deviceId === undefined ||
      state.pendingPeerDeviceId === undefined
    ) {
      return;
    }
    socketRef.current?.send({
      type: "session:reject-peer",
      sessionId: state.sessionId,
      deviceId: state.deviceId,
      peerDeviceId: state.pendingPeerDeviceId,
    });
    trackEvent("session_peer_rejected", undefined, { sessionId: state.sessionId });
  };

  const copyLink = useCallback(() => {
    if (joinUrl === "") {
      return;
    }
    void navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }, [joinUrl]);

  const copyCode = useCallback(() => {
    if (publicCode === "") return;
    void navigator.clipboard.writeText(publicCode).then(() => {
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1600);
    });
  }, [publicCode]);

  const isPending = state.pendingPeerDeviceLabel !== undefined;

  return (
    <section className="l-hero" aria-label="Hero">
      <HeroStars />
      {showGlobe && <HeroGlobe />}
      <div className="l-hero-rim" aria-hidden="true" />

      <main className="l-hero-main">
        <h1 className="l-hero-title">
          hand it off,
          <span className="l-hero-title-italic">anywhere on earth.</span>
        </h1>

        <div className="l-ticket-wrap">
          <div className="l-ticket-shadow">
            <div className="l-ticket" role="region" aria-label="Session ticket">
              <div className="l-ticket-perf" aria-hidden="true" />

              <div className="l-ticket-body">
                <div className="l-ticket-head">
                  <span className="l-ticket-code" aria-label="Session timer">
                    {countdown}
                  </span>
                  <span className="l-ticket-status" aria-live="polite">
                    {isPending && (
                      <>
                        <span className="l-ticket-status-dot" aria-hidden="true" />
                        {state.pendingPeerDeviceLabel} wants to pair
                      </>
                    )}
                  </span>
                </div>

                <h2 className="l-ticket-title l-ticket-title--code">
                  {publicCode !== "" ? (
                    publicCode
                  ) : (
                    <span className="l-ticket-title-loading" aria-hidden="true">
                      &nbsp;
                    </span>
                  )}
                </h2>

                <div className="l-ticket-from-to">
                  <div className="l-ticket-from">
                    <div className="l-ticket-ft-label">From</div>
                    <div className="l-ticket-ft-value">{state.deviceLabel ?? "This device"}</div>
                  </div>
                  <div className="l-ticket-arrow">&rarr;</div>
                  <div className="l-ticket-to">
                    <div className="l-ticket-ft-label">To</div>
                    {isPending ? (
                      <div className="l-ticket-ft-value">{state.pendingPeerDeviceLabel}</div>
                    ) : (
                      <div className="l-ticket-ft-value l-ticket-ft-value--muted">
                        Awaiting scan
                        <span className="l-blink" aria-hidden="true">
                          _
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="l-ticket-foot" role="group" aria-label="Session actions">
                  {isPending ? (
                    <>
                      <button className="l-ticket-btn" type="button" onClick={approvePeer}>
                        Allow
                      </button>
                      <button
                        className="l-ticket-btn l-ticket-btn--secondary"
                        type="button"
                        onClick={rejectPeer}
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="l-ticket-btn"
                        type="button"
                        onClick={copyLink}
                        disabled={joinUrl === ""}
                      >
                        {copied ? "Copied ✓" : "Copy link"}
                      </button>
                      <button
                        className="l-ticket-btn l-ticket-btn--secondary"
                        type="button"
                        onClick={copyCode}
                        disabled={publicCode === ""}
                      >
                        {codeCopied ? "Copied ✓" : "Copy code"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="l-ticket-stub">
                <div className="l-ticket-stub-head">Scan to pair</div>
                <div className="l-ticket-stub-mid">
                  {joinUrl === "" ? (
                    <div className="l-ticket-loading" role="status">
                      <span
                        className="spinner"
                        aria-hidden="true"
                        style={{
                          borderColor: "rgba(250,250,250,0.2)",
                          borderTopColor: "#fafafa",
                        }}
                      />
                    </div>
                  ) : (
                    <div className="l-ticket-qr-frame">
                      <VisualQr size={160} value={joinUrl} />
                      <div className="l-ticket-scan-line" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="l-ticket-stub-foot">
                  <StubJoinInput />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </section>
  );
}

function StubJoinInput() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  const handleJoin = () => {
    const normalized = code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (normalized.length >= 4) {
      navigate(`/join/${normalized}`);
    }
  };

  return (
    <div className="l-stub-join">
      <input
        className="l-stub-join-input"
        type="text"
        placeholder="Have a code? Enter it"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleJoin();
        }}
        aria-label="Session code"
        maxLength={12}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        className="l-stub-join-btn"
        type="button"
        onClick={handleJoin}
        disabled={code.trim().replace(/[^A-Z0-9]/gi, "").length < 4}
        aria-label="Join session"
      >
        Join
      </button>
    </div>
  );
}
