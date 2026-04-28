import { LegalPage } from "../components/legal-page";

export function meta() {
  return [{ title: "Privacy - handitoff.io" }];
}

export default function Privacy() {
  return (
    <LegalPage
      label="No. 004 - Privacy"
      title="No permanent profile."
      paragraphs={[
        "handitoff.io is designed around temporary browser sessions and short-lived pairing codes.",
        "Device identity lasts for the open browser tab and is used only to complete the current handoff.",
      ]}
    />
  );
}
