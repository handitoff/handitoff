import { LegalPage } from "../components/legal-page";

export function meta() {
  return [{ title: "Terms - handitoff.io" }];
}

export default function Terms() {
  return (
    <LegalPage
      label="No. 006 - Terms"
      title="Use it deliberately."
      paragraphs={[
        "Only send files you are allowed to share, and only pair devices you control or trust.",
        "Temporary sessions are meant for quick, intentional transfers between nearby devices.",
      ]}
    />
  );
}
