import type { Route } from "./+types/session";
import { AppShell } from "../components/app-shell";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Session ${params.code} - handitoff.io` }];
}

export default function Session({ params }: Route.ComponentProps) {
  return (
    <AppShell>
      <main className="stage">
        <section className="hero-panel">
          <div className="section-label">No. 002 - Channel open</div>
          <h1 className="display-title">
            Drop
            <br />
            anything.
          </h1>
          <p className="lede">
            Files dropped here will appear on the paired device. Photos, archives, documents,
            anything you need to hand off.
          </p>
          <div className="drop-strip">
            <span>Drop files anywhere</span>
            <span>{params.code}</span>
          </div>
        </section>
        <div className="hairline" />
        <aside className="side-panel">
          <div className="panel-head">
            <span>Connected</span>
            <span>02</span>
          </div>
          <div className="device-paired">
            <div className="phone-outline" aria-hidden="true">
              <div className="phone-speaker" />
              <span>✓</span>
            </div>
            <div>
              <h2>iPhone</h2>
              <p>Paired · Same network</p>
            </div>
          </div>
          <div className="transfer-list">
            <div className="progress-row">
              <div className="progress-fill" style={{ width: "0%" }} />
              <span>01 Outbound</span>
              <span>Empty</span>
            </div>
            <div className="progress-row">
              <div className="progress-fill" style={{ width: "0%" }} />
              <span>02 Inbound</span>
              <span>Waiting</span>
            </div>
          </div>
          <div className="panel-foot">
            <span>Encrypted peer-to-peer</span>
            <span>Idle</span>
          </div>
        </aside>
      </main>
    </AppShell>
  );
}
