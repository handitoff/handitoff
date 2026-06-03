import { Link } from "react-router";
import { Check, Minus } from "lucide-react";
import { useAccount } from "../../components/account/context";
import { Panel, PanelLabel, SectionHeading } from "../../components/account/ui";
import { Button } from "../../components/ui/button";
import { PLAN_ENTITLEMENTS } from "../../lib/account";

const PRO_UNLOCKS = [
  "Personal receive link — handitoff.io/to/yourname",
  "Let clients send from their browser, no account",
  "Longer sessions and higher file limits",
  "Multiple senders at once",
  "Priority relay",
  "Commercial use",
];

export default function AccountPlan() {
  const { user } = useAccount();
  const plan = PLAN_ENTITLEMENTS[user.plan];
  const isPro = user.plan === "pro";

  const entitlements: { label: string; value: string | boolean }[] = [
    { label: "Max file size", value: plan.maxFileSize },
    { label: "Session duration", value: plan.sessionDuration },
    { label: "Devices per session", value: plan.maxDevices },
    { label: "Concurrent senders", value: plan.maxConcurrentSenders },
    { label: "Receive link", value: plan.receiveLink },
    { label: "Priority relay", value: plan.priorityRelay },
  ];

  return (
    <div className="flex flex-col gap-12">
      <SectionHeading
        eyebrow="Plan"
        title="Your plan"
        description="What you have today and what upgrading unlocks."
      />

      {/* Current plan + billing */}
      <Panel className="flex flex-col gap-6 border-zinc-700 bg-zinc-900 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <PanelLabel>Current plan</PanelLabel>
          <div className="font-display text-xl tracking-tight text-zinc-50 lowercase">
            {plan.label}
          </div>
          <p className="text-[13px] text-zinc-400">
            {isPro
              ? "Active · renews 20 Jul 2026"
              : user.plan === "account"
                ? "Signed in · free"
                : "Free"}
          </p>
        </div>
        {isPro ? (
          <Button variant="secondary" size="sm" className="shrink-0">
            Manage billing
          </Button>
        ) : (
          <Button asChild size="sm" className="shrink-0">
            <Link to="/pricing">Upgrade to Pro</Link>
          </Button>
        )}
      </Panel>

      {/* Entitlements */}
      <section className="flex flex-col gap-5">
        <SectionHeading title="What's included" />
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2">
          {entitlements.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-4 bg-zinc-950 px-5 py-4"
            >
              <span className="text-sm text-zinc-300">{item.label}</span>
              {typeof item.value === "boolean" ? (
                item.value ? (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-emerald-300">
                    <Check className="h-3.5 w-3.5" />
                    Included
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-600">
                    <Minus className="h-3.5 w-3.5" />
                    Pro
                  </span>
                )
              ) : (
                <span className="text-sm font-medium text-zinc-100">{item.value}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Pro sessions upgrade everyone */}
      <Panel className="flex flex-col gap-4">
        <PanelLabel>How paid sessions work</PanelLabel>
        <h3 className="max-w-2xl font-display text-base leading-tight tracking-tight text-zinc-50 lowercase md:text-lg">
          Pro sessions upgrade everyone in the session.
        </h3>
        <p className="max-w-2xl text-[13px] leading-relaxed text-zinc-400">
          When you create a session, the people who join get your Pro benefits too — longer
          sessions, higher limits, multiple senders. Guests don't need accounts and don't pay. You
          own the session; everyone inside it inherits what you're paying for.
        </p>
      </Panel>

      {/* Upgrade path (hidden once on Pro) */}
      {!isPro && (
        <section className="flex flex-col gap-5">
          <SectionHeading
            title="What Pro unlocks"
            description="Quick handoffs stay free. Pro is for client work and larger files."
          />
          <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2">
            {PRO_UNLOCKS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 bg-zinc-950 px-5 py-4 text-sm text-zinc-200"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-50" />
                {item}
              </li>
            ))}
          </ul>
          <Button asChild size="sm" className="w-fit">
            <Link to="/pricing">See full pricing</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
