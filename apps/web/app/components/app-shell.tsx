import type { ReactNode } from "react";
import { Link, Outlet } from "react-router";

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="chrome">
        <Link to="/" className="wordmark" aria-label="handitoff.io home">
          <span className="wordmark-dots" aria-hidden="true">
            <span className="wordmark-dot" />
            <span className="wordmark-dot" />
            <span className="wordmark-dot" />
          </span>
          <span className="wordmark-text">handitoff.io</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          <Link to="/security">Security</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </header>
      {children ?? <Outlet />}
    </div>
  );
}
