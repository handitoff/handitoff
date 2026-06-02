import { AppShell } from "../components/app-shell";
import { SiteFooter } from "../components/site-footer";
import { Button } from "../components/ui/button";
import { NameRoll, useCyclingName } from "../components/animated-name";
import { seoMeta } from "../lib/seo";
import { cn } from "../lib/utils";

export function meta() {
  return seoMeta({
    title: "Your personal file receive link | handitoff",
    description:
      "Give people one link to send files to you from their browser. No install, no account, no shared folder. Receive links for client work.",
    path: "/to",
    ogTitle: "handitoff receive links — your personal file receive link",
    ogDescription:
      "Let clients and collaborators send files to you from their browser. No install, no account, no cloud folder.",
  });
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function ToPage() {
  return (
    <AppShell>
      <main className="flex-1">
        <ToHero />
        <ToClientExperience />
        <ToUseCases />
        <ToHowItWorks />
        <ToNotAFolder />
        <ToProTeaser />
        <ToFinalCta />
      </main>
      <SiteFooter />
    </AppShell>
  );
}

// 1. Hero ──────────────────────────────────────────────────────────────────────

function ToHero() {
  return (
    <section className="border-b border-zinc-900 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div className="flex flex-col gap-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            Receive links
          </p>
          <h1 className="font-display text-5xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-6xl lg:text-7xl">
            let people hand files off to you
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-zinc-400">
            Your personal file receive link. Let clients, collaborators, and friends send files to
            you from their browser.
          </p>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            <span>No install</span>
            <span aria-hidden="true">·</span>
            <span>No account</span>
            <span aria-hidden="true">·</span>
            <span>No cloud folder</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Button onClick={() => scrollToId("early-access")}>Claim your receive link</Button>
            <Button variant="secondary" onClick={() => scrollToId("how-it-works")}>
              See how it works
            </Button>
            <span className="rounded-full border border-zinc-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              Coming soon
            </span>
          </div>
        </div>

        <ReceiveLinkObject />
      </div>
    </section>
  );
}

// The URL object — the centerpiece, styled as a product surface.
function ReceiveLinkObject() {
  const nameState = useCyclingName();

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-2 shadow-2xl shadow-black/50">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        </div>

        <div className="mt-6 font-mono text-xl text-zinc-100 md:text-2xl">
          <span className="text-zinc-500">handitoff.io/to/</span>
          <NameRoll state={nameState} colored />
        </div>

        <div className="mt-6 flex items-center gap-2 text-base text-zinc-200">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden="true" />
          <span>
            <NameRoll state={nameState} capitalize /> is online
          </span>
        </div>
        <div className="mt-1 text-sm text-zinc-500">Ready to receive files</div>

        <div className="mt-7 flex flex-wrap gap-3" aria-hidden="true">
          <span className="inline-flex h-10 items-center border border-zinc-700 px-4 text-sm text-zinc-200">
            Copy link
          </span>
          <span className="inline-flex h-10 items-center bg-zinc-50 px-4 text-sm font-medium text-zinc-950">
            Turn on receive mode
          </span>
        </div>
      </div>
    </div>
  );
}

// 2. Client → You ───────────────────────────────────────────────────────────────

function ToClientExperience() {
  return (
    <section className="border-b border-zinc-900 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl font-display text-4xl leading-[0.98] tracking-tight text-zinc-50 lowercase md:text-5xl">
          Send them one link.
        </h2>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-400">
          They open it, choose files, and you approve the handoff. The other person does not need to
          think.
        </p>

        <div className="mt-14 grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          {/* Client side */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-7">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Client
            </div>
            <div className="mt-3 font-display text-2xl lowercase tracking-tight text-zinc-50">
              Send files to Tiago
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              No account needed. Choose files and send them through your browser.
            </p>
            <div className="mt-6 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-4 py-8 text-center">
              <span className="inline-flex h-10 items-center bg-zinc-50 px-4 text-sm font-medium text-zinc-950">
                Choose files
              </span>
            </div>
          </div>

          {/* Connector */}
          <div className="flex items-center justify-center font-mono text-2xl text-zinc-600" aria-hidden="true">
            <span className="hidden lg:inline">→</span>
            <span className="lg:hidden">↓</span>
          </div>

          {/* Owner side */}
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-7">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Incoming request
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-4">
              <div className="font-display text-2xl lowercase tracking-tight text-zinc-50">
                Client
              </div>
              <div className="font-mono text-sm text-zinc-400">12 files · 486 MB</div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Requesting to send. You approve before anything moves.
            </p>
            <div className="mt-6 flex gap-3" aria-hidden="true">
              <span className="inline-flex h-10 flex-1 items-center justify-center bg-zinc-50 px-4 text-sm font-medium text-zinc-950">
                Accept
              </span>
              <span className="inline-flex h-10 flex-1 items-center justify-center border border-zinc-700 px-4 text-sm text-zinc-200">
                Reject
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// 3. Use cases ──────────────────────────────────────────────────────────────────

function ToUseCases() {
  const cards = [
    {
      t: "Photographers",
      d: "Receive client photos, selects, and references during a shoot or review.",
    },
    {
      t: "Designers",
      d: "Collect logos, brand assets, screenshots, and PDFs without Drive permissions.",
    },
    {
      t: "Editors",
      d: "Receive clips, exports, and project files without chat compression.",
    },
    {
      t: "Freelancers",
      d: "Let clients send files without asking them to sign up for anything.",
    },
  ];

  return (
    <section className="border-b border-zinc-900 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-4xl leading-[0.98] tracking-tight text-zinc-50 lowercase md:text-5xl">
          Built for client work.
        </h2>
        <div className="mt-12 grid grid-cols-1 border-t border-zinc-50 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c, i) => (
            <div
              key={c.t}
              className={cn(
                "flex flex-col gap-3 border-b border-r border-zinc-800 bg-zinc-950 p-7",
                (i + 1) % 4 === 0 && "lg:border-r-0",
                (i + 1) % 2 === 0 && "sm:border-r-0 lg:border-r",
              )}
            >
              <div className="font-display text-xl leading-tight tracking-tight text-zinc-50 lowercase">
                {c.t}
              </div>
              <p className="text-sm leading-relaxed text-zinc-400">{c.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// 4. How it works ─────────────────────────────────────────────────────────────

function ToHowItWorks() {
  const steps = [
    {
      n: "01",
      t: "Claim your link",
      d: "handitoff.io/to/yourname is yours.",
    },
    {
      n: "02",
      t: "Turn on receive mode",
      d: "You decide when you are accepting files.",
    },
    {
      n: "03",
      t: "Approve and receive",
      d: "Clients send files from their browser. You stay in control.",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="border-b border-zinc-900 bg-zinc-900 px-6 py-24 md:px-12 md:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-4xl leading-[0.98] tracking-tight text-zinc-50 lowercase md:text-5xl">
          How it works.
        </h2>
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
        <p className="mt-8 flex items-start gap-3 text-sm leading-relaxed text-zinc-400">
          <span
            className="mt-0.5 shrink-0 rounded-full border border-zinc-700 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400"
            aria-hidden="true"
          >
            Note
          </span>
          <span>
            Receive links are live sessions, not cloud inboxes. You are online when files are sent.
          </span>
        </p>
      </div>
    </section>
  );
}

// 5. Not another shared folder ─────────────────────────────────────────────────

function ToNotAFolder() {
  const blocks = [
    {
      n: "01",
      t: "No setup for clients",
      d: "They do not need an account, app, or shared folder access.",
    },
    {
      n: "02",
      t: "Temporary by default",
      d: "Receive sessions exist while you are accepting files.",
    },
    {
      n: "03",
      t: "Browser-first",
      d: "Works on phones, laptops, and borrowed devices.",
    },
  ];

  return (
    <section className="border-b border-zinc-900 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-4xl leading-[0.98] tracking-tight text-zinc-50 lowercase md:text-5xl">
          Not another shared folder.
        </h2>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3">
          {blocks.map((b) => (
            <div
              key={b.n}
              className="flex flex-col gap-4 border-t border-zinc-700/60 py-7 pr-8 last:pr-0"
            >
              <div className="font-mono text-xs uppercase tracking-[0.22em] text-zinc-500">
                {b.n}
              </div>
              <div className="font-display text-xl leading-tight tracking-tight text-zinc-50 lowercase">
                {b.t}
              </div>
              <p className="text-base leading-relaxed text-zinc-400">{b.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// 6. Pro teaser ────────────────────────────────────────────────────────────────

function ToProTeaser() {
  const features = [
    "Personal receive link",
    "Longer sessions",
    "Higher limits",
    "Multiple senders",
    "Priority relay",
    "Guests never need accounts",
  ];

  return (
    <section
      id="early-access"
      className="border-b border-zinc-900 bg-zinc-900 px-6 py-24 md:px-12 md:py-32"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            handitoff Pro
          </p>
          <h2 className="font-display text-4xl leading-[0.98] tracking-tight text-zinc-50 lowercase md:text-5xl">
            Receive links will be part of Pro.
          </h2>
          <p className="max-w-md text-lg leading-relaxed text-zinc-400">
            Quick handoffs stay free. Pro is for people who use handitoff with clients,
            collaborators, and larger files.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Button aria-disabled="true" className="cursor-default">
              Join early access
            </Button>
            <span className="rounded-full border border-zinc-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              Coming soon
            </span>
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-px self-start overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-3 bg-zinc-950 px-5 py-4 text-sm text-zinc-200">
              <span className="text-zinc-50" aria-hidden="true">
                ✓
              </span>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// 7. Final CTA ─────────────────────────────────────────────────────────────────

function ToFinalCta() {
  return (
    <section className="px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8">
        <h2 className="font-display text-4xl leading-[1.02] tracking-tight text-zinc-50 lowercase md:text-6xl">
          Give people one place to send files.
        </h2>
        <div className="inline-flex w-fit items-center rounded-lg border border-zinc-700 bg-zinc-950 px-5 py-3 font-mono text-base text-zinc-100 md:text-lg">
          <span className="text-zinc-500">handitoff.io/to/</span>
          <span>yourname</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={() => scrollToId("early-access")}>Claim your receive link</Button>
          <span className="rounded-full border border-zinc-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">
            Coming soon
          </span>
        </div>
      </div>
    </section>
  );
}
