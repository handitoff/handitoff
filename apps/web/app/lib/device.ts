export type DeviceLabel = "iPhone" | "Android Phone" | "MacBook" | "Windows PC" | "iPad" | "Unknown Device";

export type BrowserDeviceIdentity = {
  id: string;
  label: DeviceLabel;
};

let cachedIdentity: BrowserDeviceIdentity | undefined;

export function getBrowserDeviceIdentity(userAgent = globalThis.navigator?.userAgent ?? ""): BrowserDeviceIdentity {
  cachedIdentity ??= {
    id: globalThis.crypto.randomUUID(),
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

