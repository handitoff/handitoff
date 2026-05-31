import { AppShell } from "./app-shell";
import { SiteFooter } from "./site-footer";

export function LegalPage({
  label,
  title,
  paragraphs,
}: {
  label: string;
  title: string;
  paragraphs: string[];
}) {
  return (
    <AppShell>
      <main className="flex-1">
        <section className="border-b border-zinc-900 px-6 py-24 md:px-12 md:py-32">
          <div className="mx-auto max-w-6xl">
            <p className="mb-8 font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
              § {label}
            </p>
            <h1 className="font-display text-5xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-7xl lg:text-8xl">
              {title}
            </h1>
          </div>
        </section>

        <section className="px-6 py-20 md:px-12 md:py-24">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-16 gap-y-2 md:grid-cols-[120px_1fr]">
            <span className="pt-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              01
            </span>
            <div className="max-w-3xl space-y-4">
              {paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-base leading-relaxed text-zinc-400">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </AppShell>
  );
}
