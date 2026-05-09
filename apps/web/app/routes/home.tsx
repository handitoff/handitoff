import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { SiteFooter } from "../components/site-footer";
import { VisualQr } from "../components/visual-qr";
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
    ogDescription: "Move files between devices instantly. No install. No account. No cloud uploads.",
    twitterTitle: "handitoff — AirDrop, but in your browser",
    twitterDescription:
      "Move files between devices instantly. No install. No account. No cloud uploads.",
  });
}

export default function Home() {
  return (
    <div className="landing">
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

        socket.onStatus((status) => {
          dispatch(
            status === "connected" ? { type: "socket:connected" } : { type: "socket:disconnected" },
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

  const displayJoinUrl = joinUrl === "" ? "Creating link..." : joinUrl.replace(/^https?:\/\//, "");

  return (
    <section className="l-hero" aria-label="Hero">
      <Link to="/" className="l-chrome-wm" aria-label="handitoff.io home">
        <img
          src="/handitoff-light-transparent.png"
          alt=""
          aria-hidden="true"
          className="wordmark-logo"
        />
        <span className="wordmark-text">handitoff.io</span>
      </Link>
      <div className="l-chrome-bottom" aria-hidden="true">
        <span>handitoff.io · 2026</span>
        <span>Scroll ↓</span>
      </div>

      <div className="l-hero-grid">
        <div className="l-type-stage">
          <h1 className="display-title">
            Point. <em>Tap.</em>
            <br />
            Receive.
          </h1>
          <p className="lede">
            Scan the code with any phone. A temporary browser channel opens for the next ten
            minutes. Files transfer directly when possible, with a relay when needed.
          </p>
        </div>
        <div className="l-hero-rule" aria-hidden="true" />
        <aside className="l-qr-panel" aria-label="Scan to join">
          <div className="panel-head">
            <span>Scan with camera</span>
            <span>01</span>
          </div>
          <div className="qr-stage">
            {joinUrl === "" ? (
              <div className="status-line" role="status">
                <span className="spinner" aria-hidden="true" />
                <span>{state.connection === "error" ? state.error : "Creating session"}</span>
              </div>
            ) : (
              <VisualQr size={300} value={joinUrl} />
            )}
          </div>
          {state.pendingPeerDeviceLabel !== undefined ? (
            <div className="panel-actions" role="group" aria-label="Pairing request">
              <span>{state.pendingPeerDeviceLabel} wants to pair.</span>
              <button className="button" type="button" onClick={approvePeer}>
                Allow
              </button>
              <button className="button secondary" type="button" onClick={rejectPeer}>
                Reject
              </button>
            </div>
          ) : (
            <div className="panel-actions" role="group" aria-label="Session controls">
              <button className="button" type="button" onClick={copyLink} disabled={joinUrl === ""}>
                {copied ? "Copied" : "Copy link"}
              </button>
              <button className="button secondary" type="button" onClick={refreshSession}>
                Refresh session
              </button>
            </div>
          )}
          <div className="panel-foot">
            <span aria-label={`Join link ${displayJoinUrl}`}>{displayJoinUrl}</span>
            <span>{countdown}</span>
          </div>
        </aside>
      </div>
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
    <section className="el-section">
      <div className="el-container">
        <h2 className="el-section-title">The whole thing, end to end.</h2>
        <div className="el-steps">
          {steps.map((s) => (
            <div key={s.n} className="el-step">
              <div className="el-step-num">{s.n}</div>
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
      n: "I",
      t: "Direct",
      d: "Files travel between browsers over WebRTC when possible. If a direct path is blocked, encrypted traffic can use a relay.",
    },
    {
      n: "II",
      t: "Disposable",
      d: "A session lasts as long as you do. Close the tab, the link is dead. Nothing to delete, because nothing was kept.",
    },
    {
      n: "III",
      t: "Frictionless",
      d: 'No app. No account. No "Continue with Google." Just a code. Even your in-laws can use it.',
    },
  ];

  return (
    <section className="el-section el-section--dark">
      <div className="el-container">
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
        <h2 className="el-section-title">Popular ways to use handitoff</h2>
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
    <section className="el-section">
      <div className="el-container">
        <h2 className="el-section-title">Things people ask.</h2>
        <div className="el-faq-list">
          {items.map((it, i) => (
            <div key={i} className="el-faq-row">
              <span className="el-faq-index">{String(i + 1).padStart(2, "0")}</span>
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
