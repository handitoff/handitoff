import { LegalPage } from "../components/legal-page";
import { seoMeta } from "../lib/seo";

export function meta() {
  return seoMeta({
    title: "Terms - handitoff.io",
    description:
      "Terms for using handitoff.io — a temporary browser-based file handoff service with accounts, receive links, and paid plans.",
    path: "/terms",
  });
}

const mailLink = "text-zinc-200 underline underline-offset-4 transition-colors hover:text-zinc-50";

export default function Terms() {
  return (
    <LegalPage
      label="Terms"
      lead="handitoff.io is a tool for moving files between devices and people through temporary browser-based sessions. These terms describe the product as it works today."
      sections={[
        {
          index: "01",
          heading: "What handitoff is",
          body: [
            "handitoff.io creates temporary browser-based sessions for transferring files.",
            "The basic product supports quick handoffs between devices without requiring an account.",
            "Signed-in features may include account identity, receive links, saved device names, better limits, paid sessions, and billing.",
            "handitoff.io is not a cloud drive, permanent file host, or file storage service unless a future feature explicitly says otherwise.",
          ],
        },
        {
          index: "02",
          heading: "Accounts",
          body: [
            "Some features require an account.",
            "Accounts may be used for:",
            [
              "claiming a handle",
              "using a receive link",
              "managing session limits",
              "creating paid sessions",
              "managing billing",
              "saving account preferences",
            ],
            "You are responsible for keeping access to your account secure.",
            "You may not impersonate another person, claim misleading handles, or use handles in a way that violates another person's rights.",
          ],
        },
        {
          index: "03",
          heading: "Receive links",
          body: [
            "Receive links allow people to request to send files to a signed-in user.",
            "A receive link does not mean anyone can upload files to permanent storage.",
            "Unless stated otherwise, receive links are live sessions. The receiver must be online and accepting files for a handoff to happen.",
            "The receiver can approve or reject senders.",
          ],
        },
        {
          index: "04",
          heading: "Paid plans",
          body: [
            "Paid plans may unlock features such as:",
            [
              "longer sessions",
              "higher limits",
              "receive links",
              "multiple senders",
              "priority relay",
              "commercial use",
              "other Pro features",
            ],
            "If a paid user creates a Pro session, guests joining that session may receive the session benefits without needing their own paid account.",
            "Billing is handled by Stripe.",
            "Subscription terms, renewal, cancellation, and payment status may affect access to paid features.",
          ],
        },
        {
          index: "05",
          heading: "Your responsibility",
          body: [
            "You are responsible for the files you send.",
            "Only transfer files you have the right to send.",
            "Only pair with devices or people you trust.",
            "Do not use handitoff.io to send, receive, or distribute material that is illegal, harmful, abusive, infringing, or violates another person's rights.",
            "Do not use handitoff.io to attack, overload, scrape, reverse engineer, abuse, or disrupt the service.",
          ],
        },
        {
          index: "06",
          heading: "No storage guarantee",
          body: [
            "handitoff.io is designed for temporary transfer sessions.",
            "Files are not retained by our servers as cloud uploads.",
            "Because the product is not a storage service, you should verify that the receiving device has successfully received and saved the file before closing the session.",
          ],
        },
        {
          index: "07",
          heading: "No delivery guarantee",
          body: [
            "handitoff.io is provided as-is.",
            "We do not guarantee:",
            [
              "uninterrupted availability",
              "transfer success",
              "transfer speed",
              "compatibility with every browser or network",
              "permanent access to any session",
            ],
            "Network conditions, browser limitations, file size, and device behavior can affect transfer success.",
            "For important files, verify receipt before ending the session.",
          ],
        },
        {
          index: "08",
          heading: "Changes to the service",
          body: [
            "handitoff.io may change over time.",
            "Features, limits, plans, and pricing may be added, removed, or changed.",
            "We may modify, suspend, or restrict access to parts of the service to protect reliability, security, or prevent abuse.",
          ],
        },
        {
          index: "09",
          heading: "Contact",
          body: [
            "Questions or concerns?",
            <>
              Write to{" "}
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
