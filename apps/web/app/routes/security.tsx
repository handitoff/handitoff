import { LegalPage } from "../components/legal-page";

export function meta() {
  return [{ title: "Security - handitoff.io" }];
}

export default function Security() {
  return (
    <LegalPage
      label="No. 005 - Security"
      title="Built for a quick handoff."
      paragraphs={[
        "A session exists only long enough for two devices to recognize each other and move what you choose.",
        "Keep the code visible only to the device you want to pair, and end the session when the handoff is done.",
      ]}
    />
  );
}
