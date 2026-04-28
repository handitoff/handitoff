import type { Route } from "./+types/join";
import { AppShell } from "../components/app-shell";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Join ${params.code} - handitoff.io` }];
}

export default function Join({ params }: Route.ComponentProps) {
  return (
    <AppShell>
      <main className="mobile-flow">
        <div className="mobile-card">
          <div className="section-label">No. 001 - Handshake</div>
          <h1 className="mobile-title">
            Hold
            <br />
            still...
          </h1>
          <p>
            Asking the desktop to open a private channel for code <strong>{params.code}</strong>.
          </p>
          <div className="status-line">
            <span className="spinner" aria-hidden="true" />
            <span>Waiting for approval</span>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
