import { AppShell } from "../components/app-shell";
import { SiteFooter } from "../components/site-footer";
import { seoMeta } from "../lib/seo";

export function meta() {
  return seoMeta({
    title: "Privacy - handitoff.io",
    description:
      "How handitoff.io handles temporary sessions, pairing metadata, device labels, and file-transfer privacy.",
    path: "/privacy",
  });
}

export default function Privacy() {
  return (
    <AppShell>
      <main style={{ minHeight: "calc(100svh - 72px)" }}>
        <section className="lp-hero">
          <p className="lp-tag">Privacy</p>
          <h1 className="lp-title">No permanent profile.</h1>
          <p className="lp-lead">
            handitoff.io is built around temporary sessions. There is nothing to log in to, nothing
            to store, and nothing to delete when you are done.
          </p>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">01</span>
            <div className="lp-body">
              <h2 className="lp-heading">What the server handles</h2>
              <p>
                To route your pairing request, our server processes your IP address (for rate
                limiting), a randomly generated session code, basic session metadata like creation
                time and expiry, and the device label your browser generates. These are transient
                records. They expire with the session and are not linked to any account.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">02</span>
            <div className="lp-body">
              <h2 className="lp-heading">What the server never sees</h2>
              <p>
                File contents are never uploaded to our servers. Once two devices are paired via
                WebRTC, data flows directly between them — or through a TURN relay if a direct
                connection is not possible. In either case, we do not have access to the file
                contents. No previews, no indexes, no permanent record of what was transferred.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">03</span>
            <div className="lp-body">
              <h2 className="lp-heading">Device labels</h2>
              <p>
                The label shown during a session (e.g. "iPhone" or "Windows PC") is derived from
                your browser's user agent string and stored only in your browser's session storage.
                It is shared with the paired device so both sides can confirm they connected to the
                right thing. It is not retained after the tab closes.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">—</span>
            <div className="lp-body">
              <h2 className="lp-heading">Questions</h2>
              <p>
                Reach us at <a href="mailto:hello@handitoff.io">hello@handitoff.io</a>.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </AppShell>
  );
}
