export type AccountUser = {
  name: string;
  avatarUrl?: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// Auth is not wired yet, so this renders the logged-out "Log in" state by default.
// Pass a `user` once accounts exist and it switches to the profile avatar.
export function AccountMenu({ user }: { user?: AccountUser }) {
  if (user === undefined) {
    return (
      <button
        type="button"
        className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full bg-zinc-50 px-4 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-950 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        Log in
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Account: ${user.name}`}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 font-mono text-xs font-medium uppercase text-zinc-100 transition-colors hover:border-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
    >
      {user.avatarUrl !== undefined ? (
        <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(user.name)
      )}
    </button>
  );
}
