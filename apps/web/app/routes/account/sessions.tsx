import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAccount } from "../../components/account/context";
import { useDevices } from "../../components/account/devices-context";
import { SessionRow } from "../../components/account/session-row";
import { EmptyState, SectionHeading } from "../../components/account/ui";
import { Button } from "../../components/ui/button";
import { devicePlatformLabel } from "../../lib/devices";
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
  return (
    s.status === "waiting" ||
    s.status === "connected" ||
    s.status === "transferring" ||
    s.status === "partially_connected" ||
    s.status === "reconnectable"
  );
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
  const reconnectable = filtered.filter((s) => s.status === "reconnectable");
  const live = active.filter((s) => s.status !== "reconnectable");
  const past = filtered.filter((s) => !isActive(s));

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Sessions"
        title="Your handoffs"
        description="Active and recent handoff sessions. The live transfer itself opens in its own session screen — this is just where you manage them."
      />

      <DeviceQuickStart />

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
          {live.length > 0 && <SessionGroup title="Active" sessions={live} />}
          {reconnectable.length > 0 && (
            <SessionGroup title="Reconnectable" sessions={reconnectable} />
          )}
          {past.length > 0 && (
            <SessionGroup title={active.length > 0 ? "Recent" : "Recent"} sessions={past} />
          )}
        </div>
      )}
    </div>
  );
}

// "Start with one of your devices" — online account devices, ready for a
// no-QR handoff. Hidden entirely when nothing else is online.
function DeviceQuickStart() {
  const { onlineTargets, startHandoff, outgoing } = useDevices();

  if (onlineTargets.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
          Start with one of your devices
        </h3>
        <p className="text-[13px] leading-relaxed text-zinc-400">
          These devices are signed in and online. Start a handoff and they'll approve it — no QR, no
          code.{" "}
          <Link
            to="/account/devices"
            className="text-zinc-300 underline underline-offset-4 hover:text-zinc-50"
          >
            Manage devices
          </Link>
        </p>
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 sm:grid-cols-2">
        {onlineTargets.map((device) => {
          const platform = devicePlatformLabel(device);
          return (
            <div
              key={device.id}
              className="flex items-center justify-between gap-3 bg-zinc-950 px-4 py-3"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-zinc-100">{device.label}</span>
                <span className="font-mono text-[11px] text-emerald-400">
                  {platform !== "" ? `${platform} · Online` : "Online"}
                </span>
              </div>
              <Button
                size="sm"
                type="button"
                onClick={() => startHandoff(device)}
                disabled={outgoing !== undefined}
              >
                {outgoing?.targetDeviceId === device.id ? "Requested…" : "Start handoff"}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
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
