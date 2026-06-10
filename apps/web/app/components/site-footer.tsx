import { Link } from "react-router";

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-900 bg-zinc-950 px-6 pb-12 pt-20 text-zinc-50 md:px-12">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-12 md:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <Link
            to="/"
            className="font-display text-5xl leading-none tracking-tight text-zinc-50 lowercase no-underline transition-opacity hover:opacity-80 md:text-6xl"
            aria-label="handitoff home"
          >
            handitoff.
          </Link>
          <p className="max-w-md text-base leading-relaxed text-zinc-400">
            A browser tool for moving files between devices. Open it, hand a file across, close the
            tab.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-12">
          <FooterCol head="Product">
            <FooterLink to="/">Transfer</FooterLink>
            <FooterLink href="/#how-it-works">How it works</FooterLink>
            <FooterLink to="/pricing">Pricing</FooterLink>
            <FooterLink to="/faq">FAQ</FooterLink>
          </FooterCol>
          <FooterCol head="Trust">
            <FooterLink to="/privacy">Privacy</FooterLink>
            <FooterLink to="/security">Security</FooterLink>
            <FooterLink to="/terms">Terms</FooterLink>
          </FooterCol>
          <FooterCol head="Other">
            <FooterLink href="mailto:hello@handitoff.io">Contact</FooterLink>
            <FooterLink href="https://github.com/handitoff/handitoff" target="_blank" rel="noopener noreferrer">
              GitHub
            </FooterLink>
          </FooterCol>
        </div>
      </div>

      <hr className="mx-auto my-12 h-px max-w-7xl border-0 bg-zinc-900" />

      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
        <a href="https://www.producthunt.com/products/handitoff?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-handitoff" target="_blank" rel="noopener noreferrer">
          <img alt="handitoff - Move files between devices directly from your browser | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1167499&amp;theme=dark&amp;t=1781077229184" />
        </a>
        <span>© {new Date().getFullYear()} handitoff</span>
        <span>
          Made with ♡ by{" "}
          <a
            href="https://github.com/OMouta"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 underline underline-offset-4 transition-colors hover:text-zinc-50"
          >
            OMouta
          </a>
        </span>
      </div>
    </footer>
  );
}

function FooterCol({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">{head}</div>
      {children}
    </div>
  );
}

function FooterLink({
  children,
  to,
  href,
  target,
  rel,
}: {
  children: React.ReactNode;
  to?: string;
  href?: string;
  target?: string;
  rel?: string;
}) {
  const cls = "text-sm text-zinc-300 no-underline transition-colors hover:text-zinc-50";
  if (href !== undefined) {
    return (
      <a href={href} target={target} rel={rel} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to ?? "/"} className={cls}>
      {children}
    </Link>
  );
}
