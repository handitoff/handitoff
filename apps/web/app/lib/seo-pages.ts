import type { FaqItem, SeoLandingPageContent } from "../components/seo-landing-page";

export type SeoPageConfig = {
  path: string;
  title: string;
  description: string;
  content: SeoLandingPageContent;
};

const allRelated = [
  { href: "/phone-to-pc", label: "Phone to PC" },
  { href: "/iphone-to-windows", label: "iPhone to Windows" },
  { href: "/android-to-mac", label: "Android to Mac" },
  { href: "/airdrop-alternative", label: "AirDrop alternative" },
  { href: "/send-large-files", label: "Send large files" },
  { href: "/no-install-file-transfer", label: "No-install transfer" },
  { href: "/faq", label: "FAQ" },
];

const phoneToPcFaq: FaqItem[] = [
  {
    question: "Do I need to install anything?",
    answer: "No. Open handitoff.io in your browser on both devices.",
  },
  {
    question: "Do I need an account?",
    answer: "No. The core transfer flow works without signing up.",
  },
  {
    question: "Are my files uploaded to the cloud?",
    answer:
      "No. handitoff creates a temporary browser transfer session. Files move directly when possible, and encrypted traffic may be relayed when needed, but files are not stored as cloud uploads.",
  },
  {
    question: "Does it reduce photo or video quality?",
    answer: "No. handitoff transfers the original file you select.",
  },
  {
    question: "Does it work on mobile data?",
    answer: "Yes. Speed depends on your mobile connection and upload speed.",
  },
];

const iphoneToWindowsFaq: FaqItem[] = [
  {
    question: "Can I transfer iPhone videos to Windows?",
    answer:
      "Yes. Choose videos from your iPhone and keep both tabs open until the transfer finishes.",
  },
  {
    question: "Does it need iCloud?",
    answer: "No. You do not need to upload the file to iCloud first.",
  },
  {
    question: "Does it need a USB cable?",
    answer: "No. Pair the devices with a QR code and transfer through the browser.",
  },
  {
    question: "Does it work in Safari?",
    answer: "Yes. Open the QR link with Safari or another browser on your iPhone.",
  },
  {
    question: "Does it compress files?",
    answer: "No. handitoff transfers the original selected file.",
  },
];

const androidToMacFaq: FaqItem[] = [
  {
    question: "Do I need Android File Transfer?",
    answer: "No. handitoff runs in the browser, so no Android File Transfer app is required.",
  },
  {
    question: "Does this work from Chrome on Android?",
    answer: "Yes. Chrome on Android works for choosing and sending files through handitoff.",
  },
  {
    question: "Does it work with large files?",
    answer:
      "Yes, but large files can take longer depending on WiFi, upload speed, browser performance, and whether the connection is direct or relayed.",
  },
  {
    question: "Are files stored on handitoff?",
    answer: "No. Sessions are temporary and files are not stored as cloud uploads.",
  },
];

const airdropFaq: FaqItem[] = [
  {
    question: "Is handitoff the same as AirDrop?",
    answer:
      "No. handitoff is not affiliated with Apple and does not use AirDrop. It is a browser-based way to move files between paired devices.",
  },
  {
    question: "Does this work on Windows?",
    answer: "Yes. Use a modern browser on Windows and scan the QR code from the other device.",
  },
  {
    question: "Does this work on Android?",
    answer: "Yes. Android devices can join from the browser and send or receive files.",
  },
  {
    question: "Do both devices need to be on the same WiFi?",
    answer:
      "No. A direct connection is attempted when possible, and relayed encrypted traffic can be used when needed.",
  },
];

const largeFilesFaq: FaqItem[] = [
  {
    question: "Is there a file size limit?",
    answer:
      "Browser and device limits can vary. Very large files depend on available memory, browser behavior, network quality, and session stability.",
  },
  {
    question: "Why is my transfer slow?",
    answer:
      "Large files depend on upload speed, download speed, WiFi quality, mobile data speed, browser performance, and whether the connection is direct or relayed.",
  },
  {
    question: "Does handitoff compress videos?",
    answer: "No. handitoff transfers the original selected video file.",
  },
  {
    question: "Are large files stored on your servers?",
    answer:
      "No. handitoff is not a cloud drive. When a relay is needed, traffic may pass through relay infrastructure, but files are not stored as cloud uploads.",
  },
];

const noInstallFaq: FaqItem[] = [
  {
    question: "Does this work on phones?",
    answer: "Yes. Open handitoff from a modern mobile browser and choose files from the device.",
  },
  {
    question: "Does this work on desktop?",
    answer: "Yes. handitoff works from modern desktop browsers on Windows, macOS, Linux, and ChromeOS.",
  },
  {
    question: "Do I need a browser extension?",
    answer: "No. There is no browser extension required.",
  },
  {
    question: "Do I need an account?",
    answer: "No. The core flow works without an account.",
  },
  {
    question: "Is this cloud storage?",
    answer: "No. handitoff creates a temporary transfer session between devices.",
  },
];

export const faqPageItems: FaqItem[] = [
  {
    question: "Are files uploaded to your servers?",
    answer:
      "No. handitoff is designed for temporary browser-based transfer between paired devices. When direct transfer is not possible, encrypted traffic may be relayed, but files are not stored as cloud uploads.",
  },
  {
    question: "Do I need an account?",
    answer: "No. The core flow works without an account.",
  },
  {
    question: "Do I need to install anything?",
    answer: "No. handitoff runs in the browser.",
  },
  {
    question: "Does it work from iPhone to Windows?",
    answer:
      "Yes. Open handitoff on your Windows PC, scan the QR code with your iPhone, and send files through the browser.",
  },
  {
    question: "Does it work on Android?",
    answer: "Yes.",
  },
  {
    question: "Does it work on mobile data?",
    answer: "Yes. Speed depends on your network and upload speed.",
  },
  {
    question: "Why are large videos slow?",
    answer:
      "Large files depend on upload speed, browser performance, and whether the connection is direct or relayed.",
  },
  {
    question: "Does it compress photos or videos?",
    answer: "No. handitoff transfers the original selected file.",
  },
  {
    question: "How long do sessions last?",
    answer: "Sessions are temporary and expire automatically.",
  },
  {
    question: "Is this cloud storage?",
    answer:
      "No. handitoff is not a cloud drive. It creates a temporary transfer session between devices.",
  },
];

export const seoPages = {
  phoneToPc: {
    path: "/phone-to-pc",
    title: "Send files from phone to PC instantly | handitoff",
    description:
      "Send files from your phone to your PC directly in the browser. No install, no account, no cloud upload.",
    content: {
      label: "Phone to PC",
      title: "Send files from your phone to your PC",
      lead:
        "Move photos, videos, PDFs, ZIPs, documents, and screenshots from your phone to your PC without cables, chat apps, cloud drives, or email.",
      steps: [
        "Open handitoff.io on your PC.",
        "Scan the QR code with your phone.",
        "Choose files on your phone.",
        "Receive them on your PC.",
      ],
      sections: [
        {
          heading: "A shorter path than sending it to yourself",
          body: [
            "Moving one file should not require WhatsApp, Drive, email, or digging for a cable. handitoff creates a temporary transfer session between the two browsers so you can move the file and leave.",
            "There is no app to install and no account to create. For large files, transfer time depends on your network, upload speed, and whether the browser connection is direct or relayed.",
          ],
        },
      ],
      faq: phoneToPcFaq,
      related: [
        { href: "/iphone-to-windows", label: "iPhone to Windows" },
        { href: "/send-large-files", label: "Send large files" },
        { href: "/no-install-file-transfer", label: "No-install file transfer" },
      ],
    },
  },
  iphoneToWindows: {
    path: "/iphone-to-windows",
    title: "Transfer files from iPhone to Windows | handitoff",
    description:
      "Move photos, videos, and files from iPhone to Windows through your browser. No cable, no app install, no iCloud upload.",
    content: {
      label: "iPhone to Windows",
      title: "Transfer files from iPhone to Windows",
      lead:
        "AirDrop is useful inside Apple devices. iPhone to Windows often means iCloud, WhatsApp, Google Drive, email, or a cable. handitoff keeps the flow in the browser.",
      steps: [
        "Open handitoff.io on Windows.",
        "Scan the QR code with the iPhone camera.",
        "Choose photos, videos, or files.",
        "Receive them on your PC.",
      ],
      sections: [
        {
          heading: "No iCloud or USB cable required",
          body: [
            "Open the site on the Windows PC, scan from the iPhone, and choose the files you want to send. The transfer runs through the browser, with a direct connection when possible and a relay when needed.",
            "Keep both tabs open for large files. Large iPhone videos may take time depending on upload speed, browser performance, and the connection path.",
          ],
        },
      ],
      faq: iphoneToWindowsFaq,
      related: [
        { href: "/phone-to-pc", label: "Phone to PC" },
        { href: "/send-large-files", label: "Send large files" },
        { href: "/airdrop-alternative", label: "AirDrop alternative" },
      ],
    },
  },
  androidToMac: {
    path: "/android-to-mac",
    title: "Transfer files from Android to Mac | handitoff",
    description:
      "Send files from Android to Mac directly in the browser. No cable, no account, no app install.",
    content: {
      label: "Android to Mac",
      title: "Transfer files from Android to Mac",
      lead:
        "Move photos, videos, screenshots, documents, and ZIP files from Android to Mac without installing another transfer app or uploading to Drive first.",
      steps: [
        "Open handitoff.io on your Mac.",
        "Scan the QR code from Chrome on Android.",
        "Choose the files on Android.",
        "Receive them in the Mac browser.",
      ],
      sections: [
        {
          heading: "Browser-based and temporary",
          body: [
            "Android to Mac file movement can be awkward when you do not want a cable, cloud drive, or Android File Transfer app. handitoff pairs the devices with a QR code and creates a temporary session.",
            "The session expires automatically. Files move directly when possible, and encrypted traffic may be relayed when needed.",
          ],
        },
      ],
      faq: androidToMacFaq,
      related: [
        { href: "/airdrop-alternative", label: "AirDrop alternative" },
        { href: "/no-install-file-transfer", label: "No-install file transfer" },
        { href: "/send-large-files", label: "Send large files" },
      ],
    },
  },
  airdropAlternative: {
    path: "/airdrop-alternative",
    title: "AirDrop alternative for any device | handitoff",
    description:
      "Use handitoff as an AirDrop alternative when your devices are not all Apple devices. Move files in the browser with no install or account.",
    content: {
      label: "AirDrop alternative",
      title: "AirDrop alternative for any device",
      lead:
        "When your devices are mixed, handitoff gives you a simple browser flow: open, scan, transfer.",
      steps: [
        "Open handitoff.io on one device.",
        "Scan the QR code from the other device.",
        "Choose files.",
        "Keep the tabs open until the transfer completes.",
      ],
      sections: [
        {
          heading: "Useful when your devices are not all Apple devices",
          body: [
            "AirDrop is great inside Apple's ecosystem. handitoff is useful for iPhone to Windows, Android to Mac, Windows to Mac, or sending a file to someone else's laptop without asking them to install anything.",
            "handitoff is not affiliated with Apple and does not use AirDrop. It creates a temporary browser session, tries a direct WebRTC connection when possible, and can use a relay when needed.",
          ],
        },
      ],
      faq: airdropFaq,
      related: [
        { href: "/iphone-to-windows", label: "iPhone to Windows" },
        { href: "/android-to-mac", label: "Android to Mac" },
        { href: "/phone-to-pc", label: "Phone to PC" },
      ],
    },
  },
  sendLargeFiles: {
    path: "/send-large-files",
    title: "Send large files between devices | handitoff",
    description:
      "Send large files between your phone, laptop, tablet, or PC through the browser. No install, no account, no cloud drive.",
    content: {
      label: "Large files",
      title: "Send large files between devices",
      lead:
        "Sometimes you do not need cloud storage. You just need a large file on another device.",
      sections: [
        {
          heading: "For videos, ZIPs, PDFs, and project files",
          body: [
            "handitoff can move phone videos, screen recordings, ZIP files, design exports, PDFs, and project files between your phone, laptop, tablet, or PC.",
            "Large files can take longer depending on upload speed, download speed, WiFi quality, mobile data speed, browser performance, and whether the connection is direct or relayed.",
          ],
        },
      ],
      tips: [
        "Keep both tabs open.",
        "Use a stable connection.",
        "Avoid locking your phone during transfer.",
        "Use WiFi when possible.",
        "Wait for the transfer to complete before closing either tab.",
      ],
      faq: largeFilesFaq,
      related: [
        { href: "/phone-to-pc", label: "Phone to PC" },
        { href: "/iphone-to-windows", label: "iPhone to Windows" },
        { href: "/no-install-file-transfer", label: "No-install file transfer" },
      ],
    },
  },
  noInstallFileTransfer: {
    path: "/no-install-file-transfer",
    title: "Transfer files without installing an app | handitoff",
    description:
      "Move files between devices from your browser. No app install, no account, no cloud uploads.",
    content: {
      label: "No install",
      title: "Transfer files without installing an app",
      lead:
        "You should not need another app, account, app store flow, or browser extension just to move a file.",
      steps: [
        "Open handitoff.io.",
        "Scan the QR code.",
        "Choose files.",
        "Transfer.",
        "Leave.",
      ],
      sections: [
        {
          heading: "Useful for temporary transfers",
          body: [
            "handitoff runs in the browser, so it is useful when the device is not yours or when you only need to move files once.",
            "There is no signup flow. The session is temporary, and handitoff is not cloud storage.",
          ],
        },
      ],
      faq: noInstallFaq,
      related: [
        { href: "/phone-to-pc", label: "Phone to PC" },
        { href: "/android-to-mac", label: "Android to Mac" },
        { href: "/faq", label: "FAQ" },
      ],
    },
  },
  faq: {
    path: "/faq",
    title: "handitoff FAQ | File transfer in your browser",
    description:
      "Common questions about handitoff, browser file transfer, direct connections, relays, privacy, file size, and device support.",
    content: {
      label: "Questions",
      title: "FAQ",
      lead:
        "Common questions about handitoff, browser file transfer, direct connections, relays, privacy, file size, and device support.",
      sections: [],
      faq: faqPageItems,
      related: allRelated.filter((link) => link.href !== "/faq"),
    },
  },
} satisfies Record<string, SeoPageConfig>;
