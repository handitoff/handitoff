import { AppShell } from "../components/app-shell";
import { SiteFooter } from "../components/site-footer";
import { seoMeta } from "../lib/seo";

export function meta() {
  return seoMeta({
    title: "Terms - handitoff.io",
    description:
      "Terms for using handitoff.io, a temporary no-storage browser file handoff service.",
    path: "/terms",
  });
}

export default function Terms() {
  return (
    <AppShell>
      <main style={{ minHeight: "calc(100svh - 72px)" }}>
        <section className="lp-hero">
          <p className="lp-tag">Terms</p>
          <h1 className="lp-title">Use it deliberately.</h1>
          <p className="lp-lead">
            handitoff.io is a tool for moving files between devices you control. These terms reflect
            what it is today — a simple, no-storage handoff service.
          </p>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">01</span>
            <div className="lp-body">
              <h2 className="lp-heading">What it is</h2>
              <p>
                handitoff.io creates temporary, browser-based sessions for transferring files
                directly between two devices. There are no accounts, no cloud storage, no permanent
                links, and no file hosting. Sessions expire. Files are not retained by our servers.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">02</span>
            <div className="lp-body">
              <h2 className="lp-heading">Your responsibility</h2>
              <p>
                You are responsible for the files you send. Only transfer files you have the right
                to share. Only pair with devices you own or explicitly trust. Do not use
                handitoff.io to transfer material that is illegal, harmful, or that violates another
                person's rights.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">03</span>
            <div className="lp-body">
              <h2 className="lp-heading">No guarantees</h2>
              <p>
                handitoff.io is provided as-is. We make no guarantees about uptime, transfer
                success, or delivery. Temporary sessions can expire. Network conditions vary. For
                anything critical, verify receipt on the other device before closing the session.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">—</span>
            <div className="lp-body">
              <h2 className="lp-heading">Contact</h2>
              <p>
                Questions or concerns? Write to{" "}
                <a href="mailto:hello@handitoff.io">hello@handitoff.io</a>.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </AppShell>
  );
}
