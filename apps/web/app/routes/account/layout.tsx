import { useState } from "react";
import { useEffect } from "react";
import { NavLink, Outlet } from "react-router";
import { AppShell } from "../../components/app-shell";
import { SiteFooter } from "../../components/site-footer";
import { NewHandoffTicket } from "../../components/account/new-handoff-ticket";
import { DevicesProvider } from "../../components/account/devices-context";
import { OnlineDot } from "../../components/account/ui";
import type { AccountContextValue } from "../../components/account/context";
import {
  PLAN_ENTITLEMENTS,
  getAccountData,
  googleSignInUrl,
  receiveLinkFor,
  updateReceiveSettings,
  type AccountData,
  type ReceiveRequest,
  type ReceiveSettings,
} from "../../lib/account";
import { seoMeta } from "../../lib/seo";
import { cn } from "../../lib/utils";

export function meta() {
  return seoMeta({
    title: "Account | handitoff",
    description: "Manage your handitoff identity, receive link, sessions, and plan.",
    path: "/account",
    noIndex: true,
  });
}

const TABS = [
  { to: "/account", label: "Overview", end: true },
  { to: "/account/devices", label: "Devices", end: false },
  { to: "/account/receive", label: "Receive", end: false },
  { to: "/account/sessions", label: "Sessions", end: false },
  { to: "/account/plan", label: "Plan", end: false },
  { to: "/account/settings", label: "Settings", end: false },
];

export default function AccountLayout() {
  const [data, setData] = useState<AccountData | undefined>();
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getAccountData({ signal: controller.signal })
      .then((accountData) => {
        setData(accountData);
        setAuthError(false);
      })
      .catch(() => setAuthError(true))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const [receiveState, setReceiveState] = useState<ReceiveSettings | undefined>();
  const [requestState, setRequestState] = useState<ReceiveRequest[] | undefined>();

  useEffect(() => {
    if (data !== undefined) {
      setReceiveState(data.receive);
      setRequestState(data.requests);
    }
  }, [data]);

  if (loading) {
    return (
      <AppShell>
        <main className="flex flex-1 items-center justify-center px-6 py-24 text-sm text-zinc-500">
          Loading account...
        </main>
      </AppShell>
    );
  }

  if (authError || data === undefined) {
    return (
      <AppShell>
        <main className="flex flex-1 items-center justify-center px-6 py-24">
          <div className="flex max-w-md flex-col gap-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Account
            </p>
            <h1 className="font-display text-2xl leading-none tracking-tight text-zinc-50 lowercase">
              Sign in to continue
            </h1>
            <p className="text-sm leading-relaxed text-zinc-400">
              Use Google to manage your handitoff identity, receive link, sessions, and plan.
            </p>
            <a
              href={googleSignInUrl()}
              className="inline-flex h-9 w-fit items-center justify-center rounded-full bg-zinc-50 px-4 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-950 no-underline transition-colors hover:bg-zinc-200"
            >
              Sign in with Google
            </a>
          </div>
        </main>
      </AppShell>
    );
  }

  const user = data.user;
  const receive = receiveState ?? data.receive;
  const requests = requestState ?? data.requests;

  const setReceive: AccountContextValue["setReceive"] = (value) => {
    setReceiveState((previous) => {
      const next = typeof value === "function" ? value(previous ?? data.receive) : value;
      void updateReceiveSettings(next)
        .then((accountData) => setData(accountData))
        .catch(() => undefined);
      return next;
    });
  };

  const setRequests: AccountContextValue["setRequests"] = (value) => {
    setRequestState((previous) =>
      typeof value === "function" ? value(previous ?? data.requests) : value,
    );
  };

  const setUser: AccountContextValue["setUser"] = (value) => {
    setData((previous) => {
      if (previous === undefined) {
        return previous;
      }
      const nextUser = typeof value === "function" ? value(previous.user) : value;
      return { ...previous, user: nextUser };
    });
  };

  const context: AccountContextValue = {
    user,
    setUser,
    receive,
    setReceive,
    requests,
    setRequests,
    liveReceive: data.liveReceive,
    sessions: data.sessions,
  };

  const plan = PLAN_ENTITLEMENTS[user.plan];
  const deviceName = user.defaultDeviceName ?? user.name;

  return (
    <AppShell user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl }}>
      <DevicesProvider>
        <main className="flex-1">
          {/* Identity band */}
          <section className="border-b border-zinc-900 px-6 py-7 md:px-12">
            <div className="mx-auto flex max-w-6xl flex-col gap-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                Account
              </p>
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3.5">
                  <Avatar user={user} />
                  <div className="flex flex-col gap-0.5">
                    <div className="font-display text-lg leading-none tracking-tight text-zinc-50 lowercase">
                      {user.name}
                    </div>
                    <div className="text-[13px] text-zinc-500">{user.email}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {user.handle !== undefined && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 py-1 pl-2.5 pr-3 font-mono text-[11px] text-zinc-300">
                      <OnlineDot online={receive.receiveMode && receive.online} />
                      {receiveLinkFor(user.handle)}
                    </span>
                  )}
                  <span className="rounded-full border border-zinc-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-300">
                    {plan.label} plan
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Tab navigation */}
          <div className="sticky top-0 z-30 border-b border-zinc-900 bg-zinc-950/85 px-6 backdrop-blur md:px-12">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
              <nav
                className="-mb-px flex items-center gap-1 overflow-x-auto"
                aria-label="Account sections"
              >
                {TABS.map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    end={tab.end}
                    className={({ isActive }) =>
                      cn(
                        "whitespace-nowrap border-b-2 px-3 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
                        isActive
                          ? "border-zinc-50 text-zinc-50"
                          : "border-transparent text-zinc-500 hover:text-zinc-200",
                      )
                    }
                  >
                    {tab.label}
                  </NavLink>
                ))}
              </nav>
              <div className="hidden py-2.5 sm:block">
                <NewHandoffTicket deviceName={deviceName} />
              </div>
            </div>
          </div>

          {/* Tab content */}
          <div className="px-6 py-8 md:px-12 md:py-10">
            <div className="mx-auto max-w-6xl">
              <Outlet context={context} />
            </div>
          </div>

          {/* New-handoff trigger for narrow screens, where it doesn't fit the tab row. */}
          <div className="fixed bottom-5 right-5 z-40 sm:hidden">
            <NewHandoffTicket deviceName={deviceName} />
          </div>
        </main>
        <SiteFooter />
      </DevicesProvider>
    </AppShell>
  );
}

function Avatar({ user }: { user: { name: string; avatarUrl?: string } }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [user.avatarUrl]);

  const initials = user.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  const showImage = user.avatarUrl !== undefined && !failed;

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 font-mono text-sm font-medium uppercase text-zinc-100">
      {showImage ? (
        <img
          src={user.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}
