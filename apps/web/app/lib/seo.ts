const SITE_URL = "https://handitoff.io";
const SITE_NAME = "handitoff.io";
const DEFAULT_TITLE = "handitoff.io - Browser-based file handoff";
const DEFAULT_DESCRIPTION =
  "Pair two devices with a QR code and move files directly through the browser. No install, no login, no cloud file storage.";
const BANNER_URL = `${SITE_URL}/banner.png`;

export type SeoOptions = {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  ogTitle?: string;
  ogDescription?: string;
  twitterTitle?: string;
  twitterDescription?: string;
};

export function seoMeta(options: SeoOptions = {}) {
  const title = options.title ?? DEFAULT_TITLE;
  const description = options.description ?? DEFAULT_DESCRIPTION;
  const canonical = `${SITE_URL}${options.path ?? "/"}`;
  const image = options.image ?? BANNER_URL;
  const robots = options.noIndex ? "noindex, nofollow" : "index, follow";
  const ogTitle = options.ogTitle ?? title;
  const ogDescription = options.ogDescription ?? description;
  const twitterTitle = options.twitterTitle ?? ogTitle;
  const twitterDescription = options.twitterDescription ?? ogDescription;

  return [
    { title },
    { name: "description", content: description },
    { name: "robots", content: robots },
    { tagName: "link", rel: "canonical", href: canonical },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: ogTitle },
    { property: "og:description", content: ogDescription },
    { property: "og:url", content: canonical },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1609" },
    { property: "og:image:height", content: "986" },
    { property: "og:image:alt", content: "handitoff.io - Point. Tap. Receive." },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: twitterTitle },
    { name: "twitter:description", content: twitterDescription },
    { name: "twitter:image", content: image },
  ];
}
