import { useEffect } from "react";
import { Link } from "react-router";
import { AppShell } from "./app-shell";
import { SiteFooter } from "./site-footer";
import { Button } from "./ui/button";

// Branded 404. Rendered by the root ErrorBoundary for any unmatched route, so it
// covers both server 404s and client-side navigation to a missing path.
export function NotFound() {
  useEffect(() => {
    document.title = "Page not found - handitoff.io";
  }, []);

  return (
    <AppShell>
      <main className="flex flex-1 items-center justify-center px-6 py-24 md:px-12">
        <div className="flex w-full max-w-2xl flex-col items-start gap-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            Error 404
          </p>
          <h1 className="font-display text-7xl leading-[0.9] tracking-tight text-zinc-50 lowercase md:text-8xl">
            Lost the handoff.
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-zinc-400">
            This page doesn&apos;t exist, or the session behind it already closed. Nothing here is
            stored, so links don&apos;t stick around.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Button asChild>
              <Link to="/">Start a handoff</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </AppShell>
  );
}
