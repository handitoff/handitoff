import { AppShell } from "../components/app-shell";
import { SiteFooter } from "../components/site-footer";

export function meta() {
  return [{ title: "Security - handitoff.io" }];
}

export default function Security() {
  return (
    <AppShell>
      <main style={{ minHeight: "calc(100svh - 72px)" }}>
        <section className="lp-hero">
          <p className="lp-tag">Security</p>
          <h1 className="lp-title">Built for a quick handoff.</h1>
          <p className="lp-lead">
            A session exists only long enough for two devices to recognize each other and move
            what you choose. Short by design, not by accident.
          </p>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">01</span>
            <div className="lp-body">
              <h2 className="lp-heading">Host approval</h2>
              <p>
                Every guest pairing request must be explicitly accepted by the host. Scanning or
                entering a code is not enough — the host device sees the request and must approve
                it before any connection is established. Unwanted connections are rejected before
                they begin.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">02</span>
            <div className="lp-body">
              <h2 className="lp-heading">Short expiry</h2>
              <p>
                Session codes expire quickly. A code that is not used within its window is
                invalidated server-side and cannot be reused. This limits the window for someone
                to intercept or guess an active code.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">03</span>
            <div className="lp-body">
              <h2 className="lp-heading">Encrypted in transit</h2>
              <p>
                WebRTC connections use DTLS-SRTP, which means all data-channel traffic is
                encrypted in transit. Beyond that, handitoff.io encrypts file chunks at the
                application layer before they leave the sending device, so the transport layer is
                not the only line of defence.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">04</span>
            <div className="lp-body">
              <h2 className="lp-heading">TURN relay</h2>
              <p>
                When a direct peer-to-peer connection is not possible — due to strict NAT or
                firewall configurations — traffic is routed through a TURN relay server. The relay
                forwards the encrypted stream but cannot read the contents. The session badge in
                the app shows whether your connection is direct or relayed.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-grid">
            <span className="lp-index">—</span>
            <div className="lp-body">
              <h2 className="lp-heading">Best practice</h2>
              <p>
                Keep the session code visible only to the device you intend to pair. End the
                session when the transfer is done. Do not leave an active session unattended.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </AppShell>
  );
}
