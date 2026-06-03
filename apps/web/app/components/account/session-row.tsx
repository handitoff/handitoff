import { Badge } from "../ui/badge";
import { StatusBadge, TierBadge } from "./ui";
import {
  formatBytes,
  formatDuration,
  formatRelativeTime,
  type HandoffSession,
} from "../../lib/account";

const TYPE_LABEL: Record<HandoffSession["type"], string> = {
  standard: "Standard",
  receive: "Receive link",
};

function isLive(status: HandoffSession["status"]) {
  return status === "waiting" || status === "connected" || status === "transferring";
}

export function SessionRow({ session }: { session: HandoffSession }) {
  const live = isLive(session.status);

  const meta: string[] = [];
  if (session.fileCount > 0) {
    meta.push(`${session.fileCount} ${session.fileCount === 1 ? "file" : "files"}`);
  }
  if (session.totalSize > 0) meta.push(formatBytes(session.totalSize));
  if (session.durationMs !== undefined) meta.push(formatDuration(session.durationMs));
  if (session.connectionType !== undefined) meta.push(session.connectionType);

  return (
    <div className="flex flex-col gap-4 bg-zinc-950 p-5 md:flex-row md:items-center md:justify-between md:gap-6">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-base tracking-[0.12em] text-zinc-50">{session.code}</span>
          <Badge variant="outline">{TYPE_LABEL[session.type]}</Badge>
          <TierBadge tier={session.tier} />
        </div>
        <div className="truncate text-sm text-zinc-400">
          {session.peerLabel && session.peerLabel !== "—" ? session.peerLabel : "No device paired"}
          <span className="mx-1.5 text-zinc-700" aria-hidden="true">
            ·
          </span>
          {formatRelativeTime(session.createdAt)}
        </div>
        {meta.length > 0 && (
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            {meta.join("  ·  ")}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 md:flex-col md:items-end">
        <StatusBadge status={session.status} />
        <div className="flex items-center gap-2">
          {live ? (
            <>
              <SessionAction emphasis>Open</SessionAction>
              <SessionAction>Copy link</SessionAction>
              <SessionAction>End</SessionAction>
            </>
          ) : (
            <>
              <SessionAction>View summary</SessionAction>
              <SessionAction>Start similar</SessionAction>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionAction({
  children,
  emphasis,
}: {
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      className={
        emphasis
          ? "inline-flex h-8 items-center rounded-md bg-zinc-50 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-950 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100"
          : "inline-flex h-8 items-center rounded-md border border-zinc-800 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100"
      }
    >
      {children}
    </button>
  );
}
