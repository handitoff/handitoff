import { useEffect, useMemo, useReducer, useRef, useState } from "react";
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
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.r * 2,
            height: s.r * 2,
            opacity: s.op,
            ["--star-op" as string]: s.op,
            animationDuration: `${3 + (i % 5)}s`,
            animationDelay: `${-(i % 7)}s`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function HeroGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const SIZE = canvas.width;
    const R = SIZE / 2;
    const TEX_W = 1024;
    const TEX_H = 512;
    let rafId = 0;

    const img = new Image();
    img.src = "/large-satellite-world-topo-map.jpg";
    img.onload = () => {
      const tmp = document.createElement("canvas");
      tmp.width = TEX_W;
      tmp.height = TEX_H;
      const tctx = tmp.getContext("2d")!;
      tctx.drawImage(img, 0, 0, TEX_W, TEX_H);
      const texPx = tctx.getImageData(0, 0, TEX_W, TEX_H).data;

      // Precompute spherical UV + shading for every pixel once
      const uBase = new Float32Array(SIZE * SIZE);
      const vRow = new Int32Array(SIZE * SIZE); // row offset pre-multiplied by TEX_W
      const sphereMask = new Uint8Array(SIZE * SIZE);
      const shadeDim = new Uint8Array(SIZE * SIZE);

      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const nx = (x - R) / R;
          const ny = (y - R) / R;
          if (nx * nx + ny * ny >= 1) continue;
          const nz = Math.sqrt(1 - nx * nx - ny * ny);
          const lat = Math.asin(-ny);
          const lon = Math.atan2(nx, nz);
          const idx = y * SIZE + x;
          uBase[idx] = (lon / (2 * Math.PI) + 0.5) * TEX_W;
          vRow[idx] = Math.min(Math.floor((0.5 - lat / Math.PI) * TEX_H), TEX_H - 1) * TEX_W;
          sphereMask[idx] = 1;
          // Limb darkening + directional light from upper-left
          const limbDark = Math.pow(nz, 0.6);
          const dirLight = Math.max(0, nx * -0.35 + ny * -0.45 + nz * 0.7);
          const brightness = limbDark * 0.55 + dirLight * 0.45;
          shadeDim[idx] = Math.round((1 - brightness) * 185);
        }
      }

      const ctx = canvas.getContext("2d")!;
      const frameData = ctx.createImageData(SIZE, SIZE);
      const out = frameData.data;
      let angle = 0;

      function render() {
        const uShift = (angle / (2 * Math.PI)) * TEX_W;
        for (let i = 0; i < SIZE * SIZE; i++) {
          if (!sphereMask[i]) continue;
          let u = uBase[i] - uShift;
          u = ((u % TEX_W) + TEX_W) % TEX_W;
          const pi = (vRow[i] + Math.floor(u)) * 4;
          const po = i * 4;
          const dim = shadeDim[i];
          out[po]     = texPx[pi]     - dim;
          out[po + 1] = texPx[pi + 1] - dim;
          out[po + 2] = texPx[pi + 2] - dim + 12; // subtle blue cast in shadows
          out[po + 3] = 255;
        }
        ctx.putImageData(frameData, 0, 0);
        angle = (angle + 0.003) % (2 * Math.PI);
        rafId = requestAnimationFrame(render);
      }

      rafId = requestAnimationFrame(render);
    };

    return () => cancelAnimationFrame(rafId);
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
        <Link to="/" className="l-nav-link l-nav-link--active l-nav-link--ancillary">Transfer</Link>
        <a href="#how-it-works" className="l-nav-link l-nav-link--ancillary">How it works</a>
        <Link to="/privacy" className="l-nav-link l-nav-link--ext">
          Privacy
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ marginLeft: 4, opacity: 0.6 }}>
            <path d="M2 2h6v6M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
        <Link to="/faq" className="l-nav-link l-nav-link--ext">
          FAQ
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ marginLeft: 4, opacity: 0.6 }}>
            <path d="M2 2h6v6M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
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
  const [restartKey, setRestartKey] = useState(0);
  const [state, dispatch] = useReducer(reduceClientSessionState, initialClientSessionState);
  const [joinUrl, setJoinUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | undefined>();
  const [copied, setCopied] = useState(false);
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
    setExpiresAt(undefined);
    setCopied(false);

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
            setExpiresAt(message.expiresAt);
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
            navigate(`/s/${current.publicCode ?? ""}`);
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
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
  };

  const refreshSession = () => {
    if (state.sessionId !== undefined && state.deviceId !== undefined) {
      socketRef.current?.send({
        type: "session:end",
        sessionId: state.sessionId,
        deviceId: state.deviceId,
      });
    }
    socketRef.current?.close();
    setRestartKey((key) => key + 1);
  };

  const copyLink = () => {
    if (joinUrl === "") {
      return;
    }
    void navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

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

                <h2 className="l-ticket-title">this device &rarr;</h2>

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
                        Awaiting scan<span className="l-blink" aria-hidden="true">_</span>
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
                    <button
                      className="l-ticket-btn"
                      type="button"
                      onClick={copyLink}
                      disabled={joinUrl === ""}
                    >
                      {copied ? "Copied ✓" : "Copy link"}
                    </button>
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
                  {joinUrl === ""
                    ? "creating session…"
                    : "↑ point your other device"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </section>
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
    <section className="el-section" id="how-it-works">
      <div className="el-container">
        <div className="ht-kicker">
          <span className="ht-kicker-num">§ 01</span>
          <span>How it works</span>
        </div>
        <h2 className="el-section-title">The whole thing, end to end.</h2>
        <div className="el-steps">
          {steps.map((s) => (
            <div key={s.n} className="el-step">
              <div className="el-step-num">Step {s.n}</div>
              <div className="el-step-title">{s.t}</div>
              <p className="el-step-body">{s.d}</p>
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
    <section className="el-section el-section--dark">
      <div className="el-container">
        <div className="ht-kicker ht-kicker--light">
          <span className="ht-kicker-num">§ 02</span>
          <span>Why it&apos;s different</span>
        </div>
        <h2 className="el-why-headline">
          Moving a file shouldn&apos;t <em>require</em> a service that knows your name.
        </h2>
        <div className="el-why-reasons">
          {reasons.map((r) => (
            <div key={r.n} className="el-why-reason">
              <div className="el-why-reason-num">{r.n}</div>
              <div className="el-why-reason-title">{r.t}</div>
              <p className="el-why-reason-body">{r.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LQuote() {
  return (
    <section className="el-section">
      <div className="el-quote-inner">
        <p className="el-quote-text">
          &ldquo;It is the <em>shortest path</em> between two devices that I have ever used. I open
          the tab, I scan, the file is there. The whole thing took less time than reading this
          sentence.&rdquo;
        </p>
        <div className="el-quote-attr">A satisfied accomplice</div>
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
    <section className="el-section">
      <div className="el-container">
        <div className="ht-kicker">
          <span className="ht-kicker-num">§ 03</span>
          <span>The short version</span>
        </div>
        <h2 className="el-section-title">
          The <em>short</em> version.
        </h2>
        <div className="el-promises">
          {promises.map((p) => (
            <div key={p.n} className="el-promise">
              <div className="el-promise-num">{p.n}</div>
              <div className="el-promise-title">{p.t}</div>
              <p className="el-promise-body">{p.d}</p>
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
    <section className="el-section">
      <div className="el-container">
        <div className="ht-kicker">
          <span className="ht-kicker-num">§ 05</span>
          <span>Popular uses</span>
        </div>
        <h2 className="el-section-title">Popular ways to use handitoff.</h2>
        <div className="el-link-grid">
          {links.map((page) => (
            <Link to={page.path} className="el-link-tile" key={page.path}>
              <span>{page.content.label}</span>
              <strong>{page.content.title}</strong>
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
      a: "Yes — drop the folder and handitoff.io will preserve its structure on the other side. Up to 2 GB per file inside it.",
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
    <section className="el-section el-section--dark">
      <div className="el-container">
        <div className="ht-kicker ht-kicker--light">
          <span className="ht-kicker-num">§ 04</span>
          <span>Things people ask</span>
        </div>
        <h2 className="el-section-title" style={{ color: "#fafafa" }}>Things people ask.</h2>
        <div className="el-faq-list">
          {items.map((it, i) => (
            <div key={i} className="el-faq-row">
              <h3 className="el-faq-q">{it.q}</h3>
              <p className="el-faq-a">{it.a}</p>
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
