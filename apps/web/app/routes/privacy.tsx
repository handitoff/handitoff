import { LegalPage } from "../components/legal-page";
import { seoMeta } from "../lib/seo";

export function meta() {
  return seoMeta({
    title: "Privacy - handitoff.io",
    description:
      "How handitoff.io handles temporary sessions, pairing metadata, device labels, and file-transfer privacy.",
    path: "/privacy",
  });
}

const mailLink = "text-zinc-200 underline underline-offset-4 transition-colors hover:text-zinc-50";

export default function Privacy() {
  return (
    <LegalPage
      label="Privacy"
      lead="handitoff.io is built around temporary sessions. There is nothing to log in to, nothing to store, and nothing to delete when you are done."
      sections={[
        {
          index: "01",
          heading: "What the server handles",
          body: [
            "To route your pairing request, our server processes your IP address (for rate limiting), a randomly generated session code, basic session metadata like creation time and expiry, and the device label your browser generates. These are transient records. They expire with the session and are not linked to any account.",
          ],
        },
        {
          index: "02",
          heading: "What the server never sees",
          body: [
            "File contents are never uploaded to our servers. Once two devices are paired via WebRTC, data flows directly between them — or through a TURN relay if a direct connection is not possible. In either case, we do not have access to the file contents. No previews, no indexes, no permanent record of what was transferred.",
          ],
        },
        {
          index: "03",
          heading: "Device labels",
          body: [
            'The label shown during a session (e.g. "iPhone" or "Windows PC") is derived from your browser\'s user agent string and stored only in your browser\'s session storage. It is shared with the paired device so both sides can confirm they connected to the right thing. It is not retained after the tab closes.',
          ],
        },
        {
          index: "04",
          heading: "Product analytics",
          body: [
            "We collect basic technical analytics to understand whether transfers connect and complete successfully. This may include an anonymous browser/device ID, browser and operating system, device type, connection type, transfer size range, transfer duration, whether a transfer succeeded or failed, and technical failure codes.",
            "We do not collect file names, file contents, file previews, file hashes, or local file paths in product analytics.",
          ],
        },
        {
          index: "—",
          heading: "Questions",
          body: [
            <>
              Reach us at{" "}
              <a href="mailto:hello@handitoff.io" className={mailLink}>
                hello@handitoff.io
              </a>
              .
            </>,
          ],
        },
      ]}
    />
  );
}
