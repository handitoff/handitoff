import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { VisualQr } from "../components/visual-qr";
import { HanditoffApiClient } from "../lib/api-client";
import { getBrowserDeviceIdentity } from "../lib/device";
import {
  initialClientSessionState,
  reduceClientSessionState,
  type ClientSessionState,
} from "../lib/session-store";
import { loadPublicRuntimeConfig } from "../lib/runtime-config";
import { HanditoffWebSocketClient } from "../lib/websocket-client";

export function meta() {
  return [
    { title: "handitoff.io" },
    {
      name: "description",
      content:
        "Scan with any phone. A peer-to-peer channel opens for ten minutes — files move directly between your devices and nowhere else.",
    },
  ];
}

export default function Home() {
  return (
    <div className="landing">
      <LHero />
      <LHowItWorks />
      <LWhy />
      <LQuote />
      <LPromises />
      <LFaq />
      <LFooter />
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

    const update = () => setRemainingSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
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
          dispatch(status === "connected" ? { type: "socket:connected" } : { type: "socket:disconnected" });
          if (status === "connected") {
            socket.send({ type: "session:create", deviceId: identity.id, deviceLabel: identity.label });
          }
        });

        socket.onMessage((message) => {
          if (message.type === "session:created") {
            dispatch({ type: "session:created", sessionId: message.sessionId, publicCode: message.publicCode });
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
            });
            window.sessionStorage.setItem("handitoff.connectedPeerLabel", peerLabel);
            window.sessionStorage.setItem("handitoff.connectedCode", current.publicCode ?? "");
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
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          dispatch({
            type: "session:error",
            message: error instanceof Error ? error.message : "Could not create a session.",
          });
        }
      });

    return () => {
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
    if (state.sessionId === undefined || state.deviceId === undefined || state.pendingPeerDeviceId === undefined) {
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
    if (state.sessionId === undefined || state.deviceId === undefined || state.pendingPeerDeviceId === undefined) {
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
      socketRef.current?.send({ type: "session:end", sessionId: state.sessionId, deviceId: state.deviceId });
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

  const hostStatus =
    state.connection === "error"
      ? state.error ?? "Could not create session"
      : state.pendingPeerDeviceLabel !== undefined
        ? `${state.pendingPeerDeviceLabel} wants to pair.`
        : state.connection === "creating"
          ? "Creating session"
          : state.connection === "expired"
            ? "Session expired"
            : "Awaiting handshake";
  const displayJoinUrl = joinUrl === "" ? "Creating link..." : joinUrl.replace(/^https?:\/\//, "");

  return (
    <section className="l-hero" aria-label="Hero">
      <Link to="/" className="l-chrome-wm" aria-label="handitoff.io home">
        <span className="wordmark-dots" aria-hidden="true">
          <span className="wordmark-dot" />
          <span className="wordmark-dot" />
          <span className="wordmark-dot" />
        </span>
        <span className="wordmark-text">handitoff.io</span>
      </Link>
      <div className="l-chrome-status" aria-hidden="true">
        {hostStatus}
      </div>
      <div className="l-chrome-bottom" aria-hidden="true">
        <span>handitoff.io · 2026</span>
        <span>Scroll ↓</span>
      </div>

      <div className="l-hero-grid">
        <div className="l-type-stage">
          <div className="l-kicker">№ 001 — A simpler way to move a file</div>
          <h1 className="display-title">
            Point. <em>Tap.</em>
            <br />
            Receive.
          </h1>
          <p className="lede">
            Scan the code with any phone. A peer-to-peer channel opens for the
            next ten minutes — files move directly between your devices and
            nowhere else.
          </p>
          <div className="drop-strip" aria-label="File drop area">
            <span>Drop files after pairing</span>
            <span>{state.publicCode ?? "Waiting"}</span>
          </div>
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
        <div className="el-section-header">
          <div>
            <div className="el-section-meta">№ 002 — How it works</div>
          </div>
          <h2 className="el-section-title">The whole thing, end to end.</h2>
        </div>
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
      d: "Files travel between devices over WebRTC. There is no server in the middle holding your photo of the parking-lot ceiling.",
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
        <div className="el-why-layout">
          <div>
            <div className="el-section-meta">№ 003 — The argument</div>
            <p className="el-why-sub">
              Three reasons we built this instead of using what already exists.
            </p>
          </div>
          <div>
            <h2 className="el-why-headline">
              Moving a file shouldn&apos;t{" "}
              <em>require</em> a service that knows your name.
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
        </div>
      </div>
    </section>
  );
}

function LQuote() {
  return (
    <section className="el-section">
      <div className="el-quote-inner">
        <div className="el-quote-label">№ 004 — In practice</div>
        <p className="el-quote-text">
          &ldquo;It is the <em>shortest path</em> between two devices that I
          have ever used. I open the tab, I scan, the file is there. The whole
          thing took less time than reading this sentence.&rdquo;
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
      d: "Files take the shortest path between two devices. Usually that path is your own Wi-Fi.",
    },
  ];

  return (
    <section className="el-section">
      <div className="el-container">
        <div className="el-section-header">
          <div>
            <div className="el-section-meta">№ 005 — Four promises</div>
          </div>
          <h2 className="el-section-title">
            The <em>short</em> version.
          </h2>
        </div>
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
        <div className="el-section-header">
          <div>
            <div className="el-section-meta">№ 006 — Questions</div>
          </div>
          <h2 className="el-section-title">Things people ask.</h2>
        </div>
        <div className="el-faq-list">
          {items.map((it, i) => (
            <div key={i} className="el-faq-row">
              <span className="el-faq-index">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="el-faq-q">{it.q}</h3>
              <p className="el-faq-a">{it.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LFooter() {
  return (
    <footer className="el-footer">
      <div className="el-footer-inner">
        <div className="el-footer-grid">
          <div className="el-footer-brand">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="wordmark-dots" aria-hidden="true">
                <span
                  className="wordmark-dot"
                  style={{ background: "#fafaf8" }}
                />
                <span
                  className="wordmark-dot"
                  style={{ background: "#fafaf8" }}
                />
                <span
                  className="wordmark-dot"
                  style={{ background: "#fafaf8" }}
                />
              </span>
              <span className="wordmark-text">handitoff.io</span>
            </div>
            <p>
              A small instrument for moving files between two devices, made with
              patience.
            </p>
          </div>
          {[
            {
              h: "Product",
              links: [
                { label: "How it works", href: "#how-it-works" },
                { label: "Specifications", href: "#specs" },
              ],
            },
            {
              h: "Trust",
              links: [
                { label: "Privacy", href: "/privacy", internal: true },
                { label: "Security", href: "/security", internal: true },
                { label: "Terms", href: "/terms", internal: true },
              ],
            },
            {
              h: "Contact",
              links: [{ label: "Email", href: "mailto:hello@handitoff.io" }],
            },
          ].map((col) => (
            <div key={col.h}>
              <div className="el-footer-col-title">{col.h}</div>
              <ul className="el-footer-links">
                {col.links.map((lk) => (
                  <li key={lk.label}>
                    {"internal" in lk && lk.internal ? (
                      <Link to={lk.href}>{lk.label}</Link>
                    ) : (
                      <a href={lk.href}>{lk.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="el-footer-bottom">
          <span>© 2026 handitoff.io</span>
          <span>Made on a quiet afternoon</span>
        </div>
      </div>
    </footer>
  );
}

