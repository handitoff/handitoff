import { Link } from "react-router";
import { SiteFooter } from "./site-footer";
import { NameRoll, useCyclingName } from "./animated-name";
import { seoPages } from "../lib/seo-pages";
import { cn } from "../lib/utils";

export default function DeferredLanding() {
  return (
    <>
      <LReceiveLinks />
      <LFlow />
      <LUseCases />
      <LPaths />
      <LCommonHandoffs />
      <LFaq />
      <LFinalCta />
      <SiteFooter />
      <SoftwareApplicationJsonLd />
    </>
  );
}

function LFlow() {
  const steps = [
    {
      n: "01",
      t: "Open",
      d: "The session is already waiting.",
      art: <FlowArtOpen />,
    },
    {
      n: "02",
      t: "Scan",
      d: "Use the other device to join.",
      art: <FlowArtScan />,
    },
    {
      n: "03",
      t: "Drop",
      d: "Files start moving.",
      art: <FlowArtDrop />,
    },
    {
      n: "04",
      t: "Leave",
      d: "Close the tab. The session disappears.",
      art: <FlowArtLeave />,
    },
  ];

  return (
    <section
      className="relative border-t border-zinc-900 bg-zinc-950 px-6 py-24 text-zinc-50 md:px-12 md:py-36"
      id="how-it-works"
    >
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-5xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-7xl lg:text-8xl">
          The whole thing in four moves.
        </h2>
        <div className="mt-20 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="flex flex-col gap-5 bg-zinc-950 p-7">
              <div className="flex h-28 items-center justify-center rounded-lg border border-zinc-800/80 bg-zinc-900/40">
                {s.art}
              </div>
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

// ── Flow illustrations ────────────────────────────────────────────────────────

function FlowArtOpen() {
  return (
    <svg width="96" height="64" viewBox="0 0 96 64" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="84" height="52" rx="5" stroke="#3f3f46" strokeWidth="1.5" />
      <path d="M6 18h84" stroke="#3f3f46" strokeWidth="1.5" />
      <circle cx="14" cy="12" r="1.6" fill="#52525b" />
      <circle cx="20" cy="12" r="1.6" fill="#52525b" />
      <circle cx="26" cy="12" r="1.6" fill="#52525b" />
      <rect x="40" y="28" width="16" height="16" rx="2" stroke="#fafafa" strokeWidth="1.5" />
      <rect x="44" y="32" width="3" height="3" fill="#fafafa" />
      <rect x="49" y="32" width="3" height="3" fill="#fafafa" />
      <rect x="44" y="37" width="3" height="3" fill="#fafafa" />
    </svg>
  );
}

function FlowArtScan() {
  return (
    <svg width="96" height="64" viewBox="0 0 96 64" fill="none" aria-hidden="true">
      <rect x="34" y="8" width="28" height="48" rx="5" stroke="#3f3f46" strokeWidth="1.5" />
      <rect x="40" y="16" width="16" height="16" rx="1.5" stroke="#fafafa" strokeWidth="1.5" />
      <rect x="43" y="19" width="3.5" height="3.5" fill="#fafafa" />
      <rect x="49.5" y="19" width="3.5" height="3.5" fill="#fafafa" />
      <rect x="43" y="25.5" width="3.5" height="3.5" fill="#fafafa" />
      <path d="M40 42h16M40 47h10" stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FlowArtDrop() {
  return (
    <svg width="96" height="64" viewBox="0 0 96 64" fill="none" aria-hidden="true">
      <rect
        x="20"
        y="12"
        width="30"
        height="38"
        rx="3"
        stroke="#fafafa"
        strokeWidth="1.5"
        transform="rotate(-8 35 31)"
      />
      <path d="M50 32h22" stroke="#52525b" strokeWidth="1.5" strokeDasharray="3 3" />
      <path
        d="M68 27l6 5-6 5"
        stroke="#fafafa"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FlowArtLeave() {
  return (
    <svg width="96" height="64" viewBox="0 0 96 64" fill="none" aria-hidden="true">
      {/* tab bar */}
      <path d="M8 40h80" stroke="#3f3f46" strokeWidth="1.5" />
      {/* active tab with close button */}
      <path
        d="M20 40v-9a3 3 0 0 1 3-3h26a3 3 0 0 1 3 3v9"
        stroke="#fafafa"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M28 34h12" stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M44 31l4 4M48 31l-4 4" stroke="#fafafa" strokeWidth="1.5" strokeLinecap="round" />
      {/* faded empty slot where a tab closed */}
      <path
        d="M58 40v-9a3 3 0 0 1 3-3h12"
        stroke="#3f3f46"
        strokeWidth="1.5"
        strokeDasharray="3 3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileChip({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-300 shadow-xl shadow-black/40">
      <svg width="15" height="18" viewBox="0 0 15 18" fill="none" aria-hidden="true">
        <path
          d="M1.5 1.5h7l5 5v9.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1Z"
          stroke="#71717a"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M8.5 1.5V6a1 1 0 0 0 1 1h4"
          stroke="#71717a"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      {name}
    </span>
  );
}

function LPaths() {
  const blocks = [
    {
      n: "01",
      t: "Direct when possible",
      d: "Browsers connect to each other when the network allows it.",
    },
    {
      n: "02",
      t: "Relayed when needed",
      d: "If the direct path is blocked, encrypted traffic can use a relay.",
    },
    {
      n: "03",
      t: "Not stored",
      d: "handitoff is a temporary transfer session, not a cloud drive.",
    },
  ];

  return (
    <section className="bg-zinc-900 px-6 py-24 text-zinc-50 md:px-12 md:py-36">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-4xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-6xl lg:text-7xl">
          It takes the shortest path it can.
        </h2>

        <div className="mt-16 flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-6 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500 md:p-10">
          <div className="flex items-center gap-3">
            <span className="text-zinc-300">Device A</span>
            <span className="relative flex-1 border-t border-dashed border-zinc-600">
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-zinc-950 px-2 text-zinc-400">
                direct
              </span>
            </span>
            <span className="text-zinc-300">Device B</span>
          </div>
          <div className="flex items-center gap-3 opacity-70">
            <span className="text-zinc-400">Device A</span>
            <span className="relative flex-1 border-t border-zinc-700">
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-zinc-950 px-2 text-zinc-500">
                relay · when needed
              </span>
            </span>
            <span className="text-zinc-400">Device B</span>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3">
          {blocks.map((b) => (
            <div
              key={b.n}
              className="flex flex-col gap-4 border-t border-zinc-700/60 py-7 pr-8 last:pr-0"
            >
              <div className="font-mono text-xs uppercase tracking-[0.22em] text-zinc-500">
                {b.n}
              </div>
              <div className="font-display text-2xl leading-tight tracking-tight text-zinc-50 lowercase">
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

function LReceiveLinks() {
  const nameState = useCyclingName();

  return (
    <section className="border-t border-zinc-900 bg-zinc-900 px-6 py-24 text-zinc-50 md:px-12 md:py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <h2 className="font-display text-4xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-5xl lg:text-6xl">
            Work with clients?
          </h2>
          <p className="text-lg leading-relaxed text-zinc-400">
            Soon, you&apos;ll be able to receive files at:
          </p>
          <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 font-mono text-sm text-zinc-100">
            <span className="text-zinc-500">handitoff.io/to/</span>
            <span>yourname</span>
          </div>
          <p className="max-w-md text-base leading-relaxed text-zinc-400">
            Let clients send files from their browser — no install, no account.
          </p>
          <Link
            to="/to"
            className="mt-1 inline-flex w-fit items-center border border-zinc-50 bg-zinc-50 px-6 py-3 font-mono text-xs uppercase tracking-[0.22em] text-zinc-950 no-underline transition-colors hover:bg-zinc-200"
          >
            Learn about receive links
          </Link>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-5">
            <div className="font-mono text-sm text-zinc-100">
              <span className="text-zinc-500">handitoff.io/to/</span>
              <NameRoll state={nameState} colored />
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
              <span>
                <NameRoll state={nameState} capitalize /> is online
              </span>
            </div>
            <div className="mt-1 text-sm text-zinc-500">Ready to receive files</div>
          </div>
          <div className="ml-8 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Client
            </div>
            <div className="mt-2 text-sm text-zinc-200">12 files · 486 MB</div>
            <div className="mt-1 text-sm text-zinc-500">Requesting to send</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LUseCases() {
  const cards = [
    { t: "Photographers", d: "Client photos, references, selects, and exports." },
    { t: "Designers", d: "Logos, PDFs, screenshots, and brand assets." },
    { t: "Creators", d: "Clips, thumbnails, captions, and social files." },
    {
      t: "Teams",
      d: "Quick handoffs between laptops, phones, and collaborators.",
    },
    { t: "Personal", d: "Phone to PC, laptop to phone, iPhone to Windows." },
  ];

  const files: { name: string; pull: string; pos: string; delay: string }[] = [
    { name: "IMG_4321.mov", pull: "tl", pos: "left-[3%] top-[8%]", delay: "0s" },
    { name: "brand-assets.zip", pull: "tr", pos: "right-[4%] top-[14%]", delay: "0.8s" },
    { name: "contract.pdf", pull: "l", pos: "left-[1%] top-1/2 -translate-y-1/2", delay: "1.6s" },
    { name: "thumbnail.png", pull: "bl", pos: "bottom-[10%] left-[8%]", delay: "1.2s" },
    { name: "client-notes.docx", pull: "br", pos: "bottom-[12%] right-[6%]", delay: "0.4s" },
  ];

  return (
    <section className="border-t border-zinc-900 bg-zinc-950 px-6 py-24 text-zinc-50 md:px-12 md:py-36">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-4xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-6xl lg:text-7xl">
          For the files that interrupt work.
        </h2>

        {/* Floating stage: files drift toward the central handoff session */}
        <div className="relative mx-auto mt-16 hidden h-[440px] max-w-4xl lg:block">
          <div
            className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-50/[0.04] blur-3xl"
            aria-hidden="true"
          />
          {files.map((f) => (
            <div
              key={f.name}
              className={cn("absolute", f.pos)}
              style={{ animation: `ht-pull-${f.pull} 5s ease-in-out ${f.delay} infinite` }}
            >
              <FileChip name={f.name} />
            </div>
          ))}
          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-50/80 bg-zinc-900 px-8 py-6 text-center shadow-2xl shadow-black/60">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              handoff session
            </div>
            <div className="mt-2 font-display text-2xl leading-tight tracking-tight text-zinc-50 lowercase">
              one clean handoff
            </div>
          </div>
        </div>

        {/* Compact fallback for small screens */}
        <div className="mt-12 flex flex-col items-center gap-6 lg:hidden">
          <div className="flex flex-wrap justify-center gap-2.5">
            {files.map((f) => (
              <FileChip key={f.name} name={f.name} />
            ))}
          </div>
          <div className="font-mono text-2xl text-zinc-600" aria-hidden="true">
            ↓
          </div>
          <div className="w-fit rounded-xl border border-zinc-50/80 bg-zinc-900 px-6 py-5 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              handoff session
            </div>
            <div className="mt-2 font-display text-xl leading-tight tracking-tight text-zinc-50 lowercase">
              one clean handoff
            </div>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 border-t border-zinc-50 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c, i) => (
            <div
              key={c.t}
              className={cn(
                "flex flex-col gap-3 border-b border-r border-zinc-800 bg-zinc-950 p-7",
                (i + 1) % 3 === 0 && "lg:border-r-0",
                (i + 1) % 2 === 0 && "sm:border-r-0 lg:border-r",
              )}
            >
              <div className="font-display text-2xl leading-tight tracking-tight text-zinc-50 lowercase">
                {c.t}
              </div>
              <p className="text-base leading-relaxed text-zinc-400">{c.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LCommonHandoffs() {
  const tiles = [
    {
      path: seoPages.phoneToPc.path,
      t: "Phone to PC",
      d: "Move files from your phone to your computer.",
    },
    {
      path: seoPages.iphoneToWindows.path,
      t: "iPhone to Windows",
      d: "Skip iCloud, cables, and chat compression.",
    },
    {
      path: seoPages.androidToMac.path,
      t: "Android to Mac",
      d: "Send files without installing another utility.",
    },
    {
      path: seoPages.airdropAlternative.path,
      t: "AirDrop alternative",
      d: "For when your devices are not all Apple.",
    },
    {
      path: seoPages.sendLargeFiles.path,
      t: "Large files",
      d: "Move videos, ZIPs, and exports through the browser.",
    },
    {
      path: seoPages.noInstallFileTransfer.path,
      t: "No install",
      d: "Use it on devices you do not want to set up.",
    },
    { path: seoPages.faq.path, t: "FAQ", d: "Short answers about privacy, relays, and limits." },
  ];

  return (
    <section className="border-t border-zinc-900 bg-zinc-950 px-6 py-24 md:px-12 md:py-36">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-5xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-7xl lg:text-8xl">
          Common handoffs.
        </h2>
        <div className="mt-16 flex flex-wrap gap-4">
          {tiles.map((tile) => (
            <Link
              to={tile.path}
              key={tile.path}
              className="group flex min-w-[240px] flex-1 flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-50 no-underline transition-colors hover:border-zinc-700 hover:bg-zinc-900"
            >
              <strong className="font-display text-xl leading-snug tracking-tight lowercase">
                {tile.t}
              </strong>
              <span className="text-sm leading-relaxed text-zinc-400">{tile.d}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function LFaq() {
  const items = [
    {
      q: "Do my files get stored?",
      a: "No. handitoff is built around temporary transfer sessions. Files are not stored as cloud uploads.",
    },
    {
      q: "Do files ever pass through a server?",
      a: "Files move directly when possible. If the network blocks a direct path, encrypted traffic can use a relay to keep the transfer working.",
    },
    {
      q: "Do I need an account?",
      a: "No. The basic transfer flow works without an account.",
    },
    {
      q: "Why is there a QR code?",
      a: "It is the fastest way to connect a second device without typing links or codes.",
    },
    {
      q: "Can I send large files?",
      a: "Yes, within the current browser limits. Large files depend on upload speed, browser behavior, and connection type.",
    },
    {
      q: "What happens when I close the tab?",
      a: "The session ends. The link/code stops being useful.",
    },
  ];

  return (
    <section className="bg-zinc-900 px-6 py-24 text-zinc-50 md:px-12 md:py-36">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-5xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-7xl lg:text-8xl">
          Questions people ask.
        </h2>
        <div className="mt-16">
          {items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-1 items-start gap-4 border-t border-zinc-700/60 py-7 last:border-b md:grid-cols-2 md:gap-12"
            >
              <h3 className="font-display text-lg leading-tight tracking-tight text-zinc-50 lowercase md:text-2xl">
                {it.q}
              </h3>
              <p className="text-base leading-relaxed text-zinc-400">{it.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LFinalCta() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section className="border-t border-zinc-900 bg-zinc-950 px-6 py-24 text-zinc-50 md:px-12 md:py-36">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-10">
        <h2 className="font-display text-4xl leading-[1.05] tracking-tight text-zinc-50 lowercase md:text-6xl lg:text-7xl">
          Open handitoff on one device.
          <br />
          <span className="text-zinc-500">Scan with another.</span>
          <br />
          Move the file.
        </h2>
        <button
          type="button"
          onClick={scrollToTop}
          className="border border-zinc-50 bg-zinc-50 px-8 py-3.5 font-mono text-xs uppercase tracking-[0.22em] text-zinc-950 transition-colors hover:bg-zinc-200"
        >
          Start a handoff
        </button>
      </div>
    </section>
  );
}

function SoftwareApplicationJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "handitoff",
          applicationCategory: "UtilitiesApplication",
          operatingSystem: "Web",
          url: "https://handitoff.io",
          description:
            "Move files between devices directly from your browser. No install, no account, no cloud uploads.",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "EUR",
          },
        }),
      }}
    />
  );
}
