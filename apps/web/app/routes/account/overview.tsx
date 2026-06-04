import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { useAccount } from "../../components/account/context";
import { useDevices } from "../../components/account/devices-context";
import { SessionRow } from "../../components/account/session-row";
import {
  CopyField,
  EmptyState,
  OnlineDot,
  Panel,
  PanelLabel,
  SectionHeading,
  StatGrid,
  StatTile,
} from "../../components/account/ui";
import { Button } from "../../components/ui/button";
import { PLAN_ENTITLEMENTS, receiveLinkFor } from "../../lib/account";

export default function AccountOverview() {
  const { user, receive, requests, sessions } = useAccount();
  const plan = PLAN_ENTITLEMENTS[user.plan];
  const hasReceiveLink = plan.receiveLink && user.handle !== undefined;
  const liveSessions = sessions.filter(
    (s) => s.status === "connected" || s.status === "transferring" || s.status === "waiting",
  );
  const recent = sessions.slice(0, 3);

  const next = nextAction({
    hasHandle: user.handle !== undefined,
    receiveAvailable: plan.receiveLink,
    receiveMode: receive.receiveMode,
    isPro: user.plan === "pro",
  });

  return (
    <div className="flex flex-col gap-12">
      {/* Next useful action */}
      <Panel className="flex flex-col gap-5 border-zinc-700 bg-zinc-900 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1.5">
          <PanelLabel>Next step</PanelLabel>
          <div className="font-display text-base tracking-tight text-zinc-50 lowercase md:text-lg">
            {next.title}
          </div>
          <p className="max-w-lg text-[13px] leading-relaxed text-zinc-400">{next.description}</p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link to={next.to}>
            {next.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </Panel>

      {/* At a glance */}
      <section className="flex flex-col gap-5">
        <SectionHeading title="At a glance" description="What your account gives you right now." />
        <StatGrid>
          <StatTile
            label="Plan"
            value={plan.label}
            hint={`${plan.maxFileSize} · ${plan.sessionDuration}`}
          />
          <StatTile
            label="Receive link"
            value={hasReceiveLink ? (receive.receiveMode ? "On" : "Off") : "Locked"}
            hint={
              hasReceiveLink
                ? receive.receiveMode
                  ? "Accepting requests"
                  : "Not accepting files"
                : "Available on Pro"
            }
          />
          <StatTile
            label="Active sessions"
            value={liveSessions.length}
            hint={liveSessions.length === 1 ? "1 live now" : `${liveSessions.length} live now`}
          />
          <StatTile
            label="Devices per session"
            value={plan.maxDevices}
            hint={plan.maxConcurrentSenders}
          />
        </StatGrid>
      </section>

      {/* Your devices */}
      <DevicesSummary />

      {/* Receive link summary */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <PanelLabel>Receive link</PanelLabel>
            {hasReceiveLink && (
              <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                <OnlineDot online={receive.receiveMode && receive.online} />
                {receive.receiveMode ? "Online" : "Off"}
              </span>
            )}
          </div>

          {hasReceiveLink && user.handle !== undefined ? (
            <>
              <CopyField
                prefix="handitoff.io/to/"
                value={user.handle}
                copyValue={receiveLinkFor(user.handle)}
              />
              <p className="text-sm leading-relaxed text-zinc-400">
                {receive.receiveMode
                  ? "People with your link can request to send files while you're online."
                  : "Your receive link is not accepting files right now."}
              </p>
              <Button asChild variant="secondary" size="sm" className="w-fit">
                <Link to="/account/receive">Manage receive link</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-zinc-400">
                A personal link people can use to send files to you — handitoff.io/to/yourname.
                Receive links are part of Pro.
              </p>
              <Button asChild size="sm" className="w-fit">
                <Link to="/account/plan">Upgrade to unlock</Link>
              </Button>
            </>
          )}
        </Panel>

        <Panel className="flex flex-col gap-5">
          <PanelLabel>Incoming</PanelLabel>
          {hasReceiveLink && requests.length > 0 ? (
            <>
              <div className="font-display text-2xl tracking-tight text-zinc-50">
                {requests.length}
                <span className="ml-2 align-middle text-[13px] font-normal text-zinc-400">
                  {requests.length === 1 ? "request waiting" : "requests waiting"}
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-zinc-400">
                People are asking to send you files. Approve each sender before anything moves.
              </p>
              <Button asChild variant="secondary" size="sm" className="w-fit">
                <Link to="/account/receive">Review requests</Link>
              </Button>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-zinc-400">
              No one is requesting to send files right now. Incoming requests show up here while
              your receive link is on.
            </p>
          )}
        </Panel>
      </section>

      {/* Recent activity */}
      <section className="flex flex-col gap-5">
        <SectionHeading
          title="Recent activity"
          description="Your latest handoff sessions."
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/account/sessions">View all</Link>
            </Button>
          }
        />
        {recent.length > 0 ? (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800">
            {recent.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No sessions yet"
            description="Start a handoff and it'll show up here."
          />
        )}
      </section>
    </div>
  );
}

// Compact "Your devices" glance: how many of the account's devices are online
// and a one-tap handoff to the first available one.
function DevicesSummary() {
  const { devices, onlineTargets, startHandoff, outgoing } = useDevices();

  if (devices.length === 0) {
    return null;
  }

  const onlineCount = devices.filter((device) => device.online).length;
  const primary = onlineTargets[0];

  return (
    <section className="flex flex-col gap-5">
      <SectionHeading
        title="Your devices"
        description="Signed-in devices you can hand off to without scanning a QR."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/account/devices">Manage</Link>
          </Button>
        }
      />
      <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <OnlineDot online={onlineCount > 0} />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-zinc-100">
              {onlineCount === 0
                ? "No other devices online"
                : primary !== undefined
                  ? `${primary.label} is online`
                  : `${onlineCount} ${onlineCount === 1 ? "device" : "devices"} online`}
            </span>
            <span className="text-[13px] text-zinc-500">
              {devices.length} {devices.length === 1 ? "device" : "devices"} on your account
            </span>
          </div>
        </div>
        {primary !== undefined ? (
          <Button
            size="sm"
            type="button"
            className="shrink-0"
            onClick={() => startHandoff(primary)}
            disabled={outgoing !== undefined}
          >
            {outgoing?.targetDeviceId === primary.id
              ? "Requested…"
              : `Start handoff with ${primary.label}`}
          </Button>
        ) : (
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <Link to="/account/devices">View devices</Link>
          </Button>
        )}
      </Panel>
    </section>
  );
}

function nextAction(input: {
  hasHandle: boolean;
  receiveAvailable: boolean;
  receiveMode: boolean;
  isPro: boolean;
}): { title: string; description: string; cta: string; to: string } {
  if (!input.hasHandle) {
    return {
      title: "Claim your receive link",
      description: "Pick a handle so people can send files to you at handitoff.io/to/yourname.",
      cta: "Claim handle",
      to: "/account/receive",
    };
  }
  if (!input.isPro) {
    return {
      title: "Unlock your receive link",
      description: "Upgrade to Pro to turn on your personal receive link and longer sessions.",
      cta: "See plans",
      to: "/account/plan",
    };
  }
  if (input.receiveAvailable && !input.receiveMode) {
    return {
      title: "Turn on receive mode",
      description: "Your link is reserved but not accepting files. Turn it on to start receiving.",
      cta: "Open receive",
      to: "/account/receive",
    };
  }
  return {
    title: "Start a new handoff",
    description: "Pull out a ticket and move files to any device in seconds.",
    cta: "New handoff",
    to: "/account/sessions",
  };
}
