import { LegalPage } from "../components/legal-page";
import { seoMeta } from "../lib/seo";

export function meta() {
  return seoMeta({
    title: "Security - handitoff.io",
    description:
      "How handitoff.io uses host approval, short-lived sessions, WebRTC transport encryption, and application-level encrypted chunks.",
    path: "/security",
  });
}

export default function Security() {
  return (
    <LegalPage
      label="Security"
      lead="A session exists only long enough for two devices to recognize each other and move what you choose. Short by design, not by accident."
      sections={[
        {
          index: "01",
          heading: "Host approval",
          body: [
            "Every guest pairing request must be explicitly accepted by the host. Scanning or entering a code is not enough — the host device sees the request and must approve it before any connection is established. Unwanted connections are rejected before they begin.",
          ],
        },
        {
          index: "02",
          heading: "Short expiry",
          body: [
            "Session codes expire quickly. A code that is not used within its window is invalidated server-side and cannot be reused. This limits the window for someone to intercept or guess an active code.",
          ],
        },
        {
          index: "03",
          heading: "Encrypted in transit",
          body: [
            "WebRTC connections use DTLS-SRTP, which means all data-channel traffic is encrypted in transit. Beyond that, handitoff.io encrypts file chunks at the application layer before they leave the sending device, so the transport layer is not the only line of defence.",
          ],
        },
        {
          index: "04",
          heading: "TURN relay",
          body: [
            "When a direct peer-to-peer connection is not possible — due to strict NAT or firewall configurations — traffic is routed through a TURN relay server. The relay forwards the encrypted stream but cannot read the contents. The session badge in the app shows whether your connection is direct or relayed.",
          ],
        },
        {
          index: "—",
          heading: "Best practice",
          body: [
            "Keep the session code visible only to the device you intend to pair. End the session when the transfer is done. Do not leave an active session unattended.",
          ],
        },
      ]}
    />
  );
}
