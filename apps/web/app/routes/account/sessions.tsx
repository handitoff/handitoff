import { useMemo, useState } from "react";
import { useAccount } from "../../components/account/context";
import { SessionRow } from "../../components/account/session-row";
import { EmptyState, SectionHeading } from "../../components/account/ui";
import { cn } from "../../lib/utils";
import type { HandoffSession } from "../../lib/account";

type Filter = "all" | "active" | "receive" | "standard";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "receive", label: "Receive" },
  { id: "standard", label: "Standard" },
];

function isActive(s: HandoffSession) {
  return s.status === "waiting" || s.status === "connected" || s.status === "transferring";
}

export default function AccountSessions() {
  const { sessions } = useAccount();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    switch (filter) {
      case "active":
        return sessions.filter(isActive);
      case "receive":
        return sessions.filter((s) => s.type === "receive");
      case "standard":
        return sessions.filter((s) => s.type === "standard");
      default:
        return sessions;
    }
  }, [sessions, filter]);

  const active = filtered.filter(isActive);
  const past = filtered.filter((s) => !isActive(s));

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Sessions"
        title="Your handoffs"
        description="Active and recent handoff sessions. The live transfer itself opens in its own session screen — this is just where you manage them."
      />

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
              filter === f.id
                ? "border-zinc-50 bg-zinc-50 text-zinc-950"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description="No sessions match this filter yet. Start a new handoff to get going."
        />
      ) : (
        <div className="flex flex-col gap-10">
          {active.length > 0 && (
            <SessionGroup title="Active now" sessions={active} />
          )}
          {past.length > 0 && (
            <SessionGroup title={active.length > 0 ? "Earlier" : "History"} sessions={past} />
          )}
        </div>
      )}
    </div>
  );
}

function SessionGroup({ title, sessions }: { title: string; sessions: HandoffSession[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">{title}</h3>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800">
        {sessions.map((session) => (
          <SessionRow key={session.id} session={session} />
        ))}
      </div>
    </section>
  );
}
