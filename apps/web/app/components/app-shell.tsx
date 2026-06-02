import type { ReactNode } from "react";
import { Link, Outlet } from "react-router";
import { AccountMenu } from "./account-menu";

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-zinc-950 text-zinc-50">
      <header className="flex h-16 shrink-0 items-center justify-between gap-6 border-b border-zinc-900 bg-zinc-950/80 px-6 backdrop-blur md:px-12">
        <Link
          to="/"
          className="font-display text-lg lowercase tracking-tight text-zinc-50 transition-opacity hover:opacity-80"
          aria-label="handitoff home"
        >
          handitoff
        </Link>
        <nav className="flex items-center gap-5" aria-label="Primary">
          <Link
            to="/pricing"
            className="hidden font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500 transition-colors hover:text-zinc-50 md:inline"
          >
            Pricing
          </Link>
          <AccountMenu />
        </nav>
      </header>
      {children ?? <Outlet />}
    </div>
  );
}
