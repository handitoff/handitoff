export type DeviceLabel = "iPhone" | "Android Phone" | "MacBook" | "Windows PC" | "iPad" | "Unknown Device";

export type BrowserDeviceIdentity = {
  id: string;
  label: DeviceLabel;
};

let cachedIdentity: BrowserDeviceIdentity | undefined;

export function getBrowserDeviceIdentity(userAgent = globalThis.navigator?.userAgent ?? ""): BrowserDeviceIdentity {
  cachedIdentity ??= {
    id: createBrowserSessionId(),
    label: inferDeviceLabel(userAgent),
  };
  return cachedIdentity;
}

export function inferDeviceLabel(userAgent: string): DeviceLabel {
  const normalized = userAgent.toLowerCase();

  if (normalized.includes("ipad")) {
    return "iPad";
  }
  if (normalized.includes("iphone")) {
    return "iPhone";
  }
  if (normalized.includes("android") && normalized.includes("mobile")) {
    return "Android Phone";
  }
  if (normalized.includes("macintosh") || normalized.includes("mac os x")) {
    return "MacBook";
  }
  if (normalized.includes("windows nt")) {
    return "Windows PC";
  }
  return "Unknown Device";
}

export function resetBrowserDeviceIdentityForTests(): void {
  cachedIdentity = undefined;
}

function createBrowserSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return formatUuidBytes(bytes);
  }

  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatUuidBytes(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
