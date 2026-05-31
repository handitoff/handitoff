import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import { useEffect } from "react";

import type { Route } from "./+types/root";
import appStylesHref from "./app.css?url";
import { publicRuntimeConfigScript } from "./lib/runtime-config";
import { trackEvent } from "./lib/analytics";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
  },
  { rel: "stylesheet", href: appStylesHref },
  { rel: "icon", href: "/handitoff.png", type: "image/png" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: publicRuntimeConfigScript(),
          }}
        />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const location = useLocation();

  useEffect(() => {
    trackEvent("device_page_view", { page: location.pathname.slice(0, 80) });
  }, [location.pathname]);

  return <Outlet />;
}

export function HydrateFallback() {
  return null;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 bg-zinc-950 px-6 py-24 text-zinc-50 md:px-12">
      <h1 className="font-display text-5xl leading-none tracking-tight lowercase md:text-7xl">
        {message}
      </h1>
      <p className="max-w-xl text-base leading-relaxed text-zinc-400">{details}</p>
      {stack && (
        <pre className="overflow-x-auto border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-300">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
