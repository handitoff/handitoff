export type DeviceLabel =
  | "iPhone"
  | "Android Phone"
  | "MacBook"
  | "Windows PC"
  | "iPad"
  | "Unknown Device";

export type BrowserDeviceIdentity = {
  id: string;
  label: DeviceLabel;
};

let cachedIdentity: BrowserDeviceIdentity | undefined;

export function getBrowserDeviceIdentity(
  userAgent = globalThis.navigator?.userAgent ?? "",
): BrowserDeviceIdentity {
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

// ── Persistent (account) device identity ─────────────────────────────────────
//
// The QR/guest flow uses an ephemeral, per-tab id (above). Signed-in devices
// need a *stable* id so the same browser is recognised as the same device
// across reloads — that's what the account presence/handoff flow registers.

const PERSISTENT_DEVICE_ID_KEY = "handitoff.accountDeviceId";

export type DeviceType = "phone" | "tablet" | "desktop";

export type DeviceMetadata = {
  /** Default human-readable label, e.g. "Windows PC". */
  label: DeviceLabel;
  browser: string;
  os: string;
  deviceType: DeviceType;
};

/**
 * A stable device id for this browser, persisted in localStorage. Falls back to
 * an ephemeral id when storage is unavailable (private mode, SSR).
 */
export function getPersistentDeviceId(): string {
  if (typeof window === "undefined") {
    return createBrowserSessionId();
  }
  try {
    const existing = window.localStorage.getItem(PERSISTENT_DEVICE_ID_KEY);
    if (existing !== null && existing.trim() !== "") {
      return existing;
    }
    const id = createBrowserSessionId();
    window.localStorage.setItem(PERSISTENT_DEVICE_ID_KEY, id);
    return id;
  } catch {
    return createBrowserSessionId();
  }
}

export function inferDeviceType(userAgent: string): DeviceType {
  const normalized = userAgent.toLowerCase();
  if (normalized.includes("ipad") || normalized.includes("tablet")) {
    return "tablet";
  }
  if (
    normalized.includes("mobile") ||
    normalized.includes("iphone") ||
    normalized.includes("android")
  ) {
    return "phone";
  }
  return "desktop";
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
