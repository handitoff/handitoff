import { FaqJsonLd, SeoLandingPage } from "../components/seo-landing-page";
import { seoPages } from "../lib/seo-pages";
import { seoMeta } from "../lib/seo";

const page = seoPages.phoneToPc;

export function meta() {
  return seoMeta({
    title: page.title,
    description: page.description,
    path: page.path,
  });
}

export default function PhoneToPc() {
  return (
    <>
      <SeoLandingPage content={page.content} />
      {page.content.faq ? <FaqJsonLd items={page.content.faq} /> : null}
    </>
  );
}
