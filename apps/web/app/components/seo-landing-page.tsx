import { Link } from "react-router";
import { AppShell } from "./app-shell";
import { SiteFooter } from "./site-footer";

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
      <main>
        <section className="seo-hero">
          <p className="seo-tag">{content.label}</p>
          <h1 className="seo-title">{content.title}</h1>
          <p className="seo-lead">{content.lead}</p>
          <div className="seo-actions">
            <Link className="button" to="/">
              Start transfer
            </Link>
            <span>Open handitoff on one device and scan with the other.</span>
          </div>
        </section>

        {content.steps ? (
          <section className="seo-section">
            <div className="seo-section-grid">
              <span className="seo-index">01</span>
              <div>
                <h2 className="seo-heading">How it works</h2>
                <ol className="seo-steps">
                  {content.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
        ) : null}

        {content.sections.map((section, index) => (
          <section className="seo-section" key={section.heading}>
            <div className="seo-section-grid">
              <span className="seo-index">
                {String(index + (content.steps ? 2 : 1)).padStart(2, "0")}
              </span>
              <div className="seo-body">
                <h2 className="seo-heading">{section.heading}</h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
          </section>
        ))}

        {content.tips ? (
          <section className="seo-section">
            <div className="seo-section-grid">
              <span className="seo-index">Tips</span>
              <div>
                <h2 className="seo-heading">For smoother transfers</h2>
                <ul className="seo-list">
                  {content.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : null}

        {content.faq ? (
          <section className="seo-section">
            <div className="seo-section-grid">
              <span className="seo-index">FAQ</span>
              <div>
                <h2 className="seo-heading">FAQ</h2>
                <div className="seo-faq-list">
                  {content.faq.map((item) => (
                    <div className="seo-faq-item" key={item.question}>
                      <h3>{item.question}</h3>
                      <p>{item.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {content.related ? (
          <section className="seo-related" aria-label="Related pages">
            <h2>Related ways to use handitoff</h2>
            <div className="seo-related-links">
              {content.related.map((link) => (
                <Link to={link.href} key={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </AppShell>
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
