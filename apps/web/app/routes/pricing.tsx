import { Link } from "react-router";
import { AppShell } from "../components/app-shell";
import { SiteFooter } from "../components/site-footer";
import { Button } from "../components/ui/button";
import { seoMeta } from "../lib/seo";
import { cn } from "../lib/utils";

export function meta() {
  return seoMeta({
    title: "Pricing | handitoff",
    description:
      "Start free. Upgrade when handitoff becomes part of your workflow. Longer sessions, receive links, larger transfers, and client-friendly workflows.",
    path: "/pricing",
    ogTitle: "handitoff pricing — start free, upgrade when you need more",
    ogDescription:
      "Use handitoff for quick handoffs without an account. Upgrade for longer sessions, receive links, larger transfers, and client work.",
  });
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function PricingPage() {
  return (
    <AppShell>
      <main className="flex-1">
        <PricingHero />
        <PricingPlans />
        <PricingCompare />
        <PricingProSessions />
        <PricingWhyPay />
        <PricingFaq />
        <PricingFinalCta />
      </main>
      <SiteFooter />
    </AppShell>
  );
}

// 1. Hero ──────────────────────────────────────────────────────────────────────

function PricingHero() {
  return (
    <section className="border-b border-zinc-900 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto flex max-w-6xl flex-col gap-7">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">Pricing</p>
        <h1 className="max-w-4xl font-display text-5xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-6xl lg:text-7xl">
          Start free. Upgrade when handitoff becomes part of your workflow.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-zinc-400">
          Use handitoff for quick file handoffs without an account. Upgrade when you need longer
          sessions, receive links, larger transfers, and client-friendly workflows.
        </p>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
          <span>No install</span>
          <span aria-hidden="true">·</span>
          <span>No account to start</span>
          <span aria-hidden="true">·</span>
          <span>No cloud uploads</span>
        </div>
      </div>
    </section>
  );
}

// 2. Plans ──────────────────────────────────────────────────────────────────────

type Plan = {
  name: string;
  tagline: string;
  price: string;
  includesHead: string;
  includes: string[];
  bestFor: string[];
  cta: { label: string } & ({ to: string } | { soon: true });
  featured?: boolean;
};

const plans: Plan[] = [
  {
    name: "Free",
    tagline: "For quick personal handoffs.",
    price: "€0",
    includesHead: "Includes",
    includes: [
      "Browser-to-browser file transfers",
      "No account required for basic sessions",
      "QR pairing",
      "Temporary sessions",
      "Standard file limits",
      "Standard relay access",
      "2-device sessions",
      "Works across phones, laptops, and desktops",
    ],
    bestFor: [
      "Moving a file from phone to PC",
      "Sending something from laptop to phone",
      "Quick one-off transfers",
      "Testing handitoff",
    ],
    cta: { label: "Start a handoff", to: "/" },
  },
  {
    name: "Account",
    tagline: "For repeat personal use.",
    price: "Free",
    includesHead: "Everything in Free, plus",
    includes: [
      "Sign in with OAuth",
      "Saved device name",
      "Longer sessions",
      "Higher file limits",
      "Basic transfer history metadata",
      "Claimed handle",
      "Easier repeat usage",
    ],
    bestFor: [
      "People who use handitoff regularly",
      "Moving files between your own devices",
      "Keeping sessions open longer",
      "Preparing your receive link",
    ],
    cta: { label: "Create account", soon: true },
  },
  {
    name: "Pro",
    tagline: "For creators, freelancers, and client work.",
    price: "Coming soon",
    includesHead: "Everything in Account, plus",
    includes: [
      "Personal receive link — handitoff.io/to/yourname",
      "Client Drop Mode — let clients send from their browser",
      "Guests do not need accounts",
      "Longer receive sessions",
      "Higher file limits",
      "Multiple senders",
      "Priority relay",
      "Commercial use",
    ],
    bestFor: [
      "Photographers receiving client photos",
      "Designers collecting brand assets",
      "Editors receiving clips and exports",
      "Freelancers getting files from clients",
      "Small teams moving files during work",
    ],
    cta: { label: "Join early access", soon: true },
    featured: true,
  },
];

function PricingPlans() {
  return (
    <section id="plans" className="border-b border-zinc-900 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.name} plan={plan} />
        ))}
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border p-7",
        plan.featured ? "border-zinc-700 bg-zinc-900" : "border-zinc-800 bg-zinc-950",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-display text-2xl lowercase tracking-tight text-zinc-50">
          {plan.name}
        </div>
        {plan.featured && (
          <span className="rounded-full border border-zinc-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
            Coming soon
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{plan.tagline}</p>

      <div className="mt-6 font-display text-4xl tracking-tight text-zinc-50">{plan.price}</div>

      <div className="mt-7 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
        {plan.includesHead}
      </div>
      <ul className="mt-3 flex flex-col gap-2.5">
        {plan.includes.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-zinc-200">
            <span className="mt-0.5 shrink-0 text-zinc-50" aria-hidden="true">
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-7 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
        Best for
      </div>
      <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-zinc-400">
        {plan.bestFor.map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2 pt-8">
        {"to" in plan.cta ? (
          <Button asChild className="w-full">
            <Link to={plan.cta.to}>{plan.cta.label}</Link>
          </Button>
        ) : (
          <Button
            variant={plan.featured ? "default" : "secondary"}
            aria-disabled="true"
            className="w-full cursor-default"
          >
            {plan.cta.label}
          </Button>
        )}
      </div>
    </div>
  );
}

// 3. Compare plans ──────────────────────────────────────────────────────────────

type Cell = "yes" | "no" | string;
type CompareRow = { feature: string; free: Cell; account: Cell; pro: Cell };

const compareRows: CompareRow[] = [
  { feature: "Browser transfers", free: "yes", account: "yes", pro: "yes" },
  { feature: "No install for guests", free: "yes", account: "yes", pro: "yes" },
  { feature: "No account needed to join", free: "yes", account: "yes", pro: "yes" },
  { feature: "QR pairing", free: "yes", account: "yes", pro: "yes" },
  { feature: "Temporary sessions", free: "yes", account: "yes", pro: "yes" },
  { feature: "Saved device name", free: "no", account: "yes", pro: "yes" },
  { feature: "Higher file limits", free: "no", account: "yes", pro: "yes" },
  { feature: "Longer sessions", free: "no", account: "yes", pro: "yes" },
  { feature: "Basic transfer metadata", free: "no", account: "yes", pro: "yes" },
  { feature: "Personal receive link", free: "no", account: "Reserved handle", pro: "yes" },
  { feature: "handitoff.io/to/yourname", free: "no", account: "Preview", pro: "yes" },
  { feature: "Client Drop Mode", free: "no", account: "no", pro: "yes" },
  { feature: "Multiple senders", free: "no", account: "no", pro: "yes" },
  { feature: "Priority relay", free: "no", account: "no", pro: "yes" },
  { feature: "Commercial use", free: "no", account: "no", pro: "yes" },
];

function CompareValue({ value }: { value: Cell }) {
  if (value === "yes") {
    return <span className="text-zinc-50">Yes</span>;
  }
  if (value === "no") {
    return <span className="text-zinc-600">—</span>;
  }
  return <span className="text-zinc-300">{value}</span>;
}

function PricingCompare() {
  return (
    <section className="border-b border-zinc-900 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-4xl leading-[0.98] tracking-tight text-zinc-50 lowercase md:text-5xl">
          Compare plans.
        </h2>

        <div className="mt-12 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-50">
                <th className="px-4 py-4 text-left font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                  Feature
                </th>
                <th className="px-4 py-4 text-right font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                  Free
                </th>
                <th className="px-4 py-4 text-right font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                  Account
                </th>
                <th className="px-4 py-4 text-right font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-50">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((row) => (
                <tr key={row.feature} className="border-b border-zinc-900">
                  <td className="px-4 py-4 text-left text-zinc-300">{row.feature}</td>
                  <td className="px-4 py-4 text-right">
                    <CompareValue value={row.free} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <CompareValue value={row.account} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <CompareValue value={row.pro} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// 4. How Pro sessions work ───────────────────────────────────────────────────────

function PricingProSessions() {
  const steps = [
    { n: "01", t: "You create the session", d: "A Pro session upgrades the whole room." },
    {
      n: "02",
      t: "They open the link",
      d: "No account, no app, no payment, no learning curve.",
    },
    {
      n: "03",
      t: "Files move",
      d: "Everyone who joins gets the Pro session benefits too.",
    },
  ];

  return (
    <section className="border-b border-zinc-900 bg-zinc-900 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl font-display text-4xl leading-[0.98] tracking-tight text-zinc-50 lowercase md:text-5xl">
          How Pro sessions work.
        </h2>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-400">
          When a Pro user creates a handoff session, the people joining that session get the Pro
          benefits too — without doing anything.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="flex flex-col gap-4 bg-zinc-950 p-8">
              <div className="font-mono text-xs uppercase tracking-[0.22em] text-zinc-500">
                {s.n}
              </div>
              <div className="font-display text-2xl leading-tight tracking-tight text-zinc-50 lowercase">
                {s.t}
              </div>
              <p className="text-base leading-relaxed text-zinc-400">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// 5. Why pay? ─────────────────────────────────────────────────────────────────────

function PricingWhyPay() {
  return (
    <section className="border-b border-zinc-900 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <h2 className="font-display text-4xl leading-[0.98] tracking-tight text-zinc-50 lowercase md:text-5xl">
          Why pay?
        </h2>
        <div className="flex flex-col gap-5 text-lg leading-relaxed text-zinc-400">
          <p>handitoff costs money to run.</p>
          <p>
            Most quick transfers can stay free because they are short and lightweight. Professional
            workflows need more: longer sessions, larger transfers, priority relay, receive links,
            and multiple senders.
          </p>
          <p>Pro pays for the reliability and infrastructure behind those workflows.</p>
        </div>
      </div>
    </section>
  );
}

// 6. FAQ ──────────────────────────────────────────────────────────────────────────

const faqItems = [
  {
    q: "Do guests need to pay?",
    a: "No. Guests can join sessions and send files without paying. If a Pro user creates the session, guests get the Pro session benefits inside that session.",
  },
  {
    q: "Will the free version stay useful?",
    a: "Yes. Quick handoffs should stay free and simple. The paid plan is for people using handitoff repeatedly or professionally.",
  },
  {
    q: "Is Pro cloud storage?",
    a: "No. Pro is not a cloud drive. The first version of Pro is focused on better live handoff sessions: receive links, longer sessions, higher limits, and multiple senders.",
  },
  {
    q: "Can clients send files without an account?",
    a: "Yes. That is the point of receive links. A client opens your link, chooses files, and sends them from the browser.",
  },
  {
    q: "What is a receive link?",
    a: "A receive link is your personal handoff URL: handitoff.io/to/yourname. When receive mode is active, people can use that link to send files to you from their browser.",
  },
  {
    q: "Will files be stored?",
    a: "No, not as part of the current transfer product. handitoff is built around temporary live sessions. Storage or offline inbox features may come later, but the core product is live file handoff.",
  },
  {
    q: "When will Pro launch?",
    a: "Soon. The current focus is making accounts, receive links, and paid sessions work properly before charging for them.",
  },
];

function PricingFaq() {
  return (
    <section className="border-b border-zinc-900 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-4xl leading-[0.98] tracking-tight text-zinc-50 lowercase md:text-5xl">
          FAQ.
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 md:grid-cols-2">
          {faqItems.map((item) => (
            <div key={item.q} className="flex flex-col gap-3 bg-zinc-950 p-7">
              <div className="font-display text-xl leading-tight tracking-tight text-zinc-50 lowercase">
                {item.q}
              </div>
              <p className="text-sm leading-relaxed text-zinc-400">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// 7. Final CTA ─────────────────────────────────────────────────────────────────────

function PricingFinalCta() {
  return (
    <section className="px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8">
        <h2 className="max-w-3xl font-display text-4xl leading-[1.02] tracking-tight text-zinc-50 lowercase md:text-6xl">
          Start free. Pay when handitoff earns its place in your workflow.
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <Button asChild>
            <Link to="/">Start a handoff</Link>
          </Button>
          <Button variant="secondary" onClick={() => scrollToId("plans")}>
            See plans
          </Button>
        </div>
      </div>
    </section>
  );
}
