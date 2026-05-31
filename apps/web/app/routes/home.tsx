import { useEffect, useMemo, useReducer, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { SiteFooter } from "../components/site-footer";
import { VisualQr } from "../components/visual-qr";
import type { CSSProperties } from "react";
import { HanditoffApiClient } from "../lib/api-client";
import { getBrowserDeviceIdentity } from "../lib/device";
import {
  initialClientSessionState,
  reduceClientSessionState,
  type ClientSessionState,
} from "../lib/session-store";
import { loadPublicRuntimeConfig } from "../lib/runtime-config";
import { seoMeta } from "../lib/seo";
import { seoPages } from "../lib/seo-pages";
import { HanditoffWebSocketClient } from "../lib/websocket-client";
import { trackEvent } from "../lib/analytics";
import { cn } from "../lib/utils";

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.transferControlToOffscreen) return;

    const offscreen = canvas.transferControlToOffscreen();
    const worker = new Worker(new URL("../lib/globe-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.postMessage({ canvas: offscreen }, [offscreen]);

    return () => worker.terminate();
  }, []);

  return (
    <div className="l-globe-wrap" aria-hidden="true">
      <canvas ref={canvasRef} width={512} height={512} className="l-globe-canvas" />
    </div>
  );
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
        <Link to="/" className="l-nav-link l-nav-link--active l-nav-link--ancillary">
          Transfer
        </Link>
        <a href="#how-it-works" className="l-nav-link l-nav-link--ancillary">
          How it works
        </a>
        <Link to="/privacy" className="l-nav-link l-nav-link--ext">
          Privacy
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
            style={{ marginLeft: 4, opacity: 0.6 }}
          >
            <path
              d="M2 2h6v6M8 2L2 8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <Link to="/faq" className="l-nav-link l-nav-link--ext">
          FAQ
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
            style={{ marginLeft: 4, opacity: 0.6 }}
          >
            <path
              d="M2 2h6v6M8 2L2 8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </nav>
    </header>
  );
}

export default function Home() {
  return (
    <div className="landing">
      <LNav />
      <LHero />
      <LHowItWorks />
      <LWhy />
      <LQuote />
      <LPromises />
      <LPopularUses />
      <LFaq />
      <SiteFooter />
      <SoftwareApplicationJsonLd />
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
    const api = new HanditoffApiClient({ baseUrl: initialConfig.apiUrl });

    dispatch({ type: "session:create-start", deviceId: identity.id, deviceLabel: identity.label });
    dispatch({ type: "socket:connecting" });
    setJoinUrl("");
    setPublicCode("");
    setExpiresAt(undefined);
    setCopied(false);
    setCodeCopied(false);

    void api
      .getConfig({ signal: controller.signal })
      .catch(() => initialConfig)
      .then((config) => {
        if (controller.signal.aborted) {
          return;
        }

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
            window.sessionStorage.setItem(
              "handitoff.deviceLabel",
              current.deviceLabel ?? "MacBook",
            );
            window.sessionStorage.setItem("handitoff.peerDeviceId", message.peerDeviceId);
            window.sessionStorage.setItem("handitoff.connectedPeerLabel", peerLabel);
            window.sessionStorage.setItem("handitoff.connectedCode", current.publicCode ?? "");
            window.sessionStorage.setItem("handitoff.role", "host");
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
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          dispatch({
            type: "session:error",
            message: error instanceof Error ? error.message : "Could not create a session.",
          });
        }
      });

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
      <HeroGlobe />
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

function LHowItWorks() {
  const steps = [
    {
      n: "01",
      t: "Open",
      d: "Visit the site. A QR code is waiting — no clicks, no signup, no install.",
    },
    {
      n: "02",
      t: "Scan",
      d: "Point your phone camera at the code. Both devices recognise each other instantly.",
    },
    {
      n: "03",
      t: "Drop",
      d: "Drag a file onto either window. It begins transferring the moment it lands.",
    },
    {
      n: "04",
      t: "Forget",
      d: "When you close the tab, the channel disappears. Nothing was stored, anywhere.",
    },
  ];

  return (
    <section
      className="relative border-t border-zinc-900 bg-zinc-950 px-6 py-24 text-zinc-50 md:px-12 md:py-36"
      id="how-it-works"
    >
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-5xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-7xl lg:text-8xl">
          The whole thing, end to end.
        </h2>
        <div className="mt-24 grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="flex flex-col gap-4 border-t border-zinc-50 pt-5">
              <div className="font-mono text-xs uppercase tracking-[0.22em] text-zinc-500">
                Step {s.n}
              </div>
              <div className="font-display text-2xl leading-tight tracking-tight text-zinc-50 lowercase">
                {s.t}
              </div>
              <p className="text-base leading-relaxed text-zinc-400">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LWhy() {
  const reasons = [
    {
      n: "01",
      t: "Direct",
      d: "Files travel between browsers over WebRTC when possible. If a direct path is blocked, encrypted traffic can use a relay.",
    },
    {
      n: "02",
      t: "Disposable",
      d: "A session lasts as long as you do. Close the tab, the link is dead. Nothing to delete, because nothing was kept.",
    },
    {
      n: "03",
      t: "Frictionless",
      d: 'No app. No account. No "Continue with Google." Just a code. Even your in-laws can use it.',
    },
  ];

  return (
    <section className="bg-zinc-900 px-6 py-24 text-zinc-50 md:px-12 md:py-36">
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-20 font-display text-4xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-6xl lg:text-7xl">
          Moving a file shouldn&apos;t{" "}
          <em className="font-serif italic text-zinc-500">require</em> a service that knows your
          name.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3">
          {reasons.map((r) => (
            <div
              key={r.n}
              className="flex flex-col gap-4 border-t border-zinc-700/60 py-7 pr-8 last:pr-0"
            >
              <div className="font-mono text-xs uppercase tracking-[0.22em] text-zinc-500">
                {r.n}
              </div>
              <div className="font-display text-2xl leading-tight tracking-tight text-zinc-50 lowercase">
                {r.t}
              </div>
              <p className="text-base leading-relaxed text-zinc-400">{r.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LQuote() {
  return (
    <section className="border-t border-zinc-900 bg-zinc-950 px-6 py-24 md:px-12 md:py-36">
      <div className="mx-auto max-w-4xl text-center">
        <p className="font-sans text-2xl font-medium leading-snug tracking-tight text-zinc-100 md:text-3xl lg:text-4xl">
          &ldquo;It is the{" "}
          <em className="font-serif font-normal italic text-zinc-400">shortest path</em> between
          two devices that I have ever used. I open the tab, I scan, the file is there. The whole
          thing took less time than reading this sentence.&rdquo;
        </p>
        <div className="mt-10 font-mono text-[11px] uppercase tracking-[0.28em] text-zinc-500">
          A satisfied accomplice
        </div>
      </div>
    </section>
  );
}

function LPromises() {
  const promises = [
    {
      n: "01",
      t: "Free.",
      d: 'Not "free with an asterisk." Not "free, until we Series-B." Free.',
    },
    {
      n: "02",
      t: "Quiet.",
      d: "No analytics. No cookies. No newsletter that you didn't ask for and can't escape.",
    },
    {
      n: "03",
      t: "Forgetful.",
      d: "handitoff.io remembers nothing. Not your file, not your face, not your face's file.",
    },
    {
      n: "04",
      t: "Fast.",
      d: "Files take a direct path when the browsers can make one. Otherwise, a relay keeps the transfer moving.",
    },
  ];

  return (
    <section className="border-t border-zinc-900 bg-zinc-950 px-6 py-24 md:px-12 md:py-36">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-5xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-7xl lg:text-8xl">
          The <em className="font-serif italic text-zinc-400">short</em> version.
        </h2>
        <div className="mt-16 grid grid-cols-1 border border-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
          {promises.map((p, i) => (
            <div
              key={p.n}
              className={cn(
                "flex flex-col gap-3 bg-zinc-900 p-8",
                i > 0 && "border-zinc-800",
                i > 0 && "sm:border-l",
                i === 2 && "sm:border-l-0 lg:border-l",
                i % 2 === 0 && "sm:border-l-0 lg:border-l-0",
                i === 0 ? "" : "lg:border-l",
                i >= 2 && "sm:border-t lg:border-t-0",
              )}
            >
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                {p.n}
              </div>
              <div className="font-display text-3xl leading-none tracking-tight text-zinc-50 lowercase md:text-4xl">
                {p.t}
              </div>
              <p className="mt-1 text-[15px] leading-relaxed text-zinc-400">{p.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LPopularUses() {
  const links = [
    seoPages.phoneToPc,
    seoPages.iphoneToWindows,
    seoPages.androidToMac,
    seoPages.airdropAlternative,
    seoPages.sendLargeFiles,
    seoPages.noInstallFileTransfer,
    seoPages.faq,
  ];

  return (
    <section className="border-t border-zinc-900 bg-zinc-950 px-6 py-24 md:px-12 md:py-36">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-5xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-7xl lg:text-8xl">
          Popular ways to use handitoff.
        </h2>
        <div className="mt-16 grid grid-cols-1 border-t border-zinc-50 sm:grid-cols-2 lg:grid-cols-4">
          {links.map((page, i) => (
            <Link
              to={page.path}
              key={page.path}
              className={cn(
                "group flex min-h-[140px] flex-col justify-between gap-4 border-b border-r border-zinc-800 bg-zinc-950 p-7 text-zinc-50 no-underline transition-colors hover:bg-zinc-900",
                (i + 1) % 4 === 0 && "lg:border-r-0",
                (i + 1) % 2 === 0 && "sm:border-r-0 lg:border-r",
              )}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                {page.content.label}
              </span>
              <strong className="font-display text-xl leading-snug tracking-tight lowercase">
                {page.content.title}
              </strong>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function LFaq() {
  const items = [
    {
      q: "Do my files touch a server?",
      a: "No. Once the handshake completes, packets travel directly device-to-device. The signaling server only helps you say hello — it never sees the data.",
    },
    {
      q: "What happens after 10 minutes?",
      a: "The session ends. The code is invalidated, peers are disconnected, and any in-flight transfer is dropped. Open a new tab to start again.",
    },
    {
      q: "Can I send a folder?",
      a: "Yes — drop the folder and handitoff.io will preserve its structure on the other side. Up to 1 GB per file, 25 files per transfer, and 2 GB total per session.",
    },
    {
      q: "Why is there no app?",
      a: "Because the web is the app. Installing something to move one file is the kind of friction we are trying to remove.",
    },
    {
      q: "Is there a history of past transfers?",
      a: "Deliberately, no. We keep no logs of what you sent, when, or to whom. The only record is the file on the other device.",
    },
  ];

  return (
    <section className="bg-zinc-900 px-6 py-24 text-zinc-50 md:px-12 md:py-36">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-5xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-7xl lg:text-8xl">
          Things people ask.
        </h2>
        <div className="mt-16">
          {items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-1 items-start gap-4 border-t border-zinc-700/60 py-7 last:border-b md:grid-cols-2 md:gap-12"
            >
              <h3 className="font-display text-lg leading-tight tracking-tight text-zinc-50 lowercase md:text-2xl">
                {it.q}
              </h3>
              <p className="text-base leading-relaxed text-zinc-400">{it.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SoftwareApplicationJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "handitoff",
          applicationCategory: "UtilitiesApplication",
          operatingSystem: "Web",
          url: "https://handitoff.io",
          description:
            "Move files between devices directly from your browser. No install, no account, no cloud uploads.",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "EUR",
          },
        }),
      }}
    />
  );
}
