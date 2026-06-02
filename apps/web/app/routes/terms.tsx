import { LegalPage } from "../components/legal-page";
import { seoMeta } from "../lib/seo";

export function meta() {
  return seoMeta({
    title: "Terms - handitoff.io",
    description:
      "Terms for using handitoff.io, a temporary no-storage browser file handoff service.",
    path: "/terms",
  });
}

const mailLink = "text-zinc-200 underline underline-offset-4 transition-colors hover:text-zinc-50";

export default function Terms() {
  return (
    <LegalPage
      label="Terms"
      title="Use it deliberately."
      lead="handitoff.io is a tool for moving files between devices you control. These terms reflect what it is today — a simple, no-storage handoff service."
      sections={[
        {
          index: "01",
          heading: "What it is",
          body: [
            "handitoff.io creates temporary, browser-based sessions for transferring files directly between two devices. There are no accounts, no cloud storage, no permanent links, and no file hosting. Sessions expire. Files are not retained by our servers.",
          ],
        },
        {
          index: "02",
          heading: "Your responsibility",
          body: [
            "You are responsible for the files you send. Only transfer files you have the right to share. Only pair with devices you own or explicitly trust. Do not use handitoff.io to transfer material that is illegal, harmful, or that violates another person's rights.",
          ],
        },
        {
          index: "03",
          heading: "No guarantees",
          body: [
            "handitoff.io is provided as-is. We make no guarantees about uptime, transfer success, or delivery. Temporary sessions can expire. Network conditions vary. For anything critical, verify receipt on the other device before closing the session.",
          ],
        },
        {
          index: "—",
          heading: "Contact",
          body: [
            <>
              Questions or concerns? Write to{" "}
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
