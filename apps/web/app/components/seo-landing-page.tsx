import { Link } from "react-router";
import { AppShell } from "./app-shell";
import { SiteFooter } from "./site-footer";
import { Button } from "./ui/button";

export type FaqItem = {
  question: string;
  answer: string;
};

export type RelatedLink = {
  href: string;
  label: string;
};

export type SeoLandingPageContent = {
  label: string;
  title: string;
  lead: string;
  steps?: string[];
  sections: Array<{
    heading: string;
    body: string[];
  }>;
  tips?: string[];
  faq?: FaqItem[];
  related?: RelatedLink[];
};

export function SeoLandingPage({ content }: { content: SeoLandingPageContent }) {
  return (
    <AppShell>
      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-zinc-900 px-6 py-24 md:px-12 md:py-32">
          <div className="mx-auto max-w-6xl">
            <p className="mb-8 font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
              § {content.label}
            </p>
            <h1 className="mb-8 max-w-5xl font-display text-5xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-7xl lg:text-8xl">
              {content.title}
            </h1>
            <p className="mb-10 max-w-2xl text-lg leading-relaxed text-zinc-400">{content.lead}</p>
            <div className="flex flex-wrap items-center gap-5 text-sm text-zinc-500">
              <Button asChild>
                <Link to="/">Start transfer</Link>
              </Button>
              <span>Open handitoff on one device and scan with the other.</span>
            </div>
          </div>
        </section>

        {content.steps ? (
          <SeoSection index="01" heading="How it works">
            <ol className="list-decimal space-y-3 pl-5 text-base leading-relaxed text-zinc-400 marker:text-zinc-600">
              {content.steps.map((step) => (
                <li key={step} className="pl-2">
                  {step}
                </li>
              ))}
            </ol>
          </SeoSection>
        ) : null}

        {content.sections.map((section, index) => (
          <SeoSection
            key={section.heading}
            index={String(index + (content.steps ? 2 : 1)).padStart(2, "0")}
            heading={section.heading}
          >
            <div className="space-y-4 text-base leading-relaxed text-zinc-400">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </SeoSection>
        ))}

        {content.tips ? (
          <SeoSection index="TIPS" heading="For smoother transfers">
            <ul className="list-disc space-y-3 pl-5 text-base leading-relaxed text-zinc-400 marker:text-zinc-600">
              {content.tips.map((tip) => (
                <li key={tip} className="pl-2">
                  {tip}
                </li>
              ))}
            </ul>
          </SeoSection>
        ) : null}

        {content.faq ? (
          <SeoSection index="FAQ" heading="Questions">
            <div className="divide-y divide-zinc-900 border-t border-zinc-800">
              {content.faq.map((item) => (
                <div key={item.question} className="py-6">
                  <h3 className="font-display text-lg lowercase tracking-tight text-zinc-50">
                    {item.question}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-zinc-400">{item.answer}</p>
                </div>
              ))}
            </div>
          </SeoSection>
        ) : null}

        {content.related ? (
          <section className="border-t border-zinc-900 px-6 pb-24 pt-16 md:px-12" aria-label="Related pages">
            <div className="mx-auto max-w-6xl">
              <h2 className="mb-8 font-display text-xl lowercase tracking-tight text-zinc-50">
                Related ways to use handitoff
              </h2>
              <div className="grid grid-cols-1 border-t border-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
                {content.related.map((link, i) => (
                  <Link
                    to={link.href}
                    key={link.href}
                    className={
                      "group flex min-h-[140px] flex-col justify-between gap-4 border-b border-r border-zinc-900 p-6 text-zinc-50 no-underline transition-colors hover:bg-zinc-900/60 " +
                      ((i + 1) % 4 === 0 ? "lg:border-r-0 " : "") +
                      ((i + 1) % 2 === 0 ? "sm:border-r-0 lg:border-r " : "")
                    }
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      Go to
                    </span>
                    <strong className="font-display text-lg leading-snug lowercase tracking-tight">
                      {link.label}
                    </strong>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </AppShell>
  );
}

function SeoSection({
  index,
  heading,
  children,
}: {
  index: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-zinc-900 px-6 py-20 md:px-12 md:py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-[80px_minmax(0,_760px)]">
        <span className="pt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
          {index}
        </span>
        <div>
          <h2 className="mb-6 font-display text-2xl leading-tight tracking-tight text-zinc-50 lowercase md:text-3xl">
            {heading}
          </h2>
          {children}
        </div>
      </div>
    </section>
  );
}

export function FaqJsonLd({ items }: { items: FaqItem[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer,
            },
          })),
        }),
      }}
    />
  );
}
