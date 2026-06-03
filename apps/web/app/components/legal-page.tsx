import type { ReactNode } from "react";
import { AppShell } from "./app-shell";
import { SiteFooter } from "./site-footer";

export type LegalSection = {
  index: string;
  heading: string;
  body: ReactNode[];
};

export function LegalPage({
  label,
  lead,
  sections,
}: {
  label: string;
  lead?: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <AppShell>
      <main className="flex-1">
        <section className="border-b border-zinc-900 px-6 py-24 md:px-12 md:py-32">
          <div className="mx-auto flex max-w-6xl flex-col gap-7">
            <h1 className="max-w-4xl font-display text-5xl leading-[0.95] tracking-tight text-zinc-50 lowercase md:text-6xl lg:text-7xl">
              {label}
            </h1>
            {lead !== undefined && (
              <p className="max-w-2xl text-lg leading-relaxed text-zinc-400">{lead}</p>
            )}
          </div>
        </section>

        {sections.map((section) => (
          <section
            key={section.index + section.heading}
            className="border-b border-zinc-900 px-6 py-16 last:border-b-0 md:px-12 md:py-20"
          >
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-16 gap-y-4 md:grid-cols-[120px_1fr]">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                {section.index}
              </span>
              <div className="max-w-3xl space-y-4">
                <h2 className="font-display text-2xl leading-tight tracking-tight text-zinc-50 lowercase md:text-3xl">
                  {section.heading}
                </h2>
                {section.body.map((node, i) =>
                  Array.isArray(node) ? (
                    <ul key={i} className="flex flex-col gap-2.5">
                      {node.map((item, j) => (
                        <li
                          key={j}
                          className="flex items-start gap-2.5 text-base leading-relaxed text-zinc-400"
                        >
                          <span
                            className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600"
                            aria-hidden="true"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p key={i} className="text-base leading-relaxed text-zinc-400">
                      {node}
                    </p>
                  ),
                )}
              </div>
            </div>
          </section>
        ))}
      </main>
      <SiteFooter />
    </AppShell>
  );
}
