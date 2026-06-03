import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { getAccountData, googleSignInUrl, signOut } from "../lib/account";
import { cn } from "../lib/utils";

export type AccountUser = {
  name: string;
  email?: string;
  avatarUrl?: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// Auth is not wired yet, so this renders the logged-out "Log in" state by default.
// Pass a `user` once accounts exist and it switches to the profile avatar + menu.
export function AccountMenu({ user }: { user?: AccountUser }) {
  const [currentUser, setCurrentUser] = useState(user);

  useEffect(() => {
    if (user !== undefined) {
      setCurrentUser(user);
      return;
    }

    const controller = new AbortController();
    getAccountData({ signal: controller.signal })
      .then((data) =>
        setCurrentUser({
          name: data.user.name,
          email: data.user.email,
          avatarUrl: data.user.avatarUrl,
        }),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [user]);

  if (currentUser === undefined) {
    return (
      <a
        href={googleSignInUrl()}
        className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full bg-zinc-50 px-4 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-950 no-underline transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        Sign in
      </a>
    );
  }

  return <AccountDropdown user={currentUser} onSignedOut={() => setCurrentUser(undefined)} />;
}

function AccountDropdown({ user, onSignedOut }: { user: AccountUser; onSignedOut: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Account: ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 font-mono text-xs font-medium uppercase text-zinc-100 transition-colors hover:border-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        <AvatarContent user={user} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50"
        >
          <div className="flex flex-col gap-0.5 border-b border-zinc-800 px-4 py-3">
            <div className="truncate text-sm font-medium text-zinc-100">{user.name}</div>
          </div>
          <div className="flex flex-col py-1.5" onClick={() => setOpen(false)}>
            <MenuLink to="/account/receive">Receive files</MenuLink>
            <MenuLink to="/account">Account</MenuLink>
            <MenuLink to="/account/plan">Billing</MenuLink>
          </div>
          <div className="border-t border-zinc-800 py-1.5">
            <button
              type="button"
              onClick={() => {
                void signOut().finally(() => {
                  onSignedOut();
                  window.location.assign("/");
                });
              }}
              className="w-full px-4 py-2 text-left text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              role="menuitem"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AvatarContent({ user }: { user: AccountUser }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [user.avatarUrl]);

  if (user.avatarUrl === undefined || failed) {
    return initials(user.name);
  }

  return (
    <img
      src={user.avatarUrl}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

function MenuLink({
  to,
  children,
  muted,
}: {
  to: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      className={cn(
        "px-4 py-2 text-sm no-underline transition-colors hover:bg-zinc-800",
        muted ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-200 hover:text-zinc-50",
      )}
    >
      {children}
    </Link>
  );
}
