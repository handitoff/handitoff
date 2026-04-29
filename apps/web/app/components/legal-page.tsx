import { AppShell } from "./app-shell";

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
      <main className="legal-page">
        <div className="section-label">{label}</div>
        <h1>{title}</h1>
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </main>
    </AppShell>
  );
}
