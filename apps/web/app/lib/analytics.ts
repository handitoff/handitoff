import { transferSizeBucket, type AnalyticsEventName } from "@handitoff/analytics";
import { loadPublicRuntimeConfig } from "./runtime-config";

const ANONYMOUS_ID_KEY = "handitoff_anonymous_id";

export type TrackEventProperties = Record<string, string | number | boolean | null | undefined>;

export function getAnonymousDeviceId(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY);
    if (existing !== null && existing.trim() !== "") {
      return existing;
    }
    const id =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `anonymous-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(ANONYMOUS_ID_KEY, id);
    return id;
  } catch {
    return undefined;
  }
}

export function trackEvent(
  eventName: AnalyticsEventName,
  properties: TrackEventProperties | undefined = {},
  context: { sessionId?: string; transferId?: string } = {},
): void {
  if (typeof window === "undefined") {
    return;
  }

  const config = loadPublicRuntimeConfig();
  const anonymousId = getAnonymousDeviceId();
  if (anonymousId === undefined) {
    return;
  }

  const body = {
    eventName,
    anonymousId,
    ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }),
    ...(context.transferId === undefined ? {} : { transferId: context.transferId }),
    properties: {
      ...getBrowserProperties(),
      ...compactProperties(properties ?? {}),
    },
  };

  const url = `${config.apiUrl.replace(/\/$/, "")}/api/analytics/events`;
  try {
    const payload = JSON.stringify(body);
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: payload,
      credentials: "omit",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    return;
  }
}

export function sizeBucketForBytes(totalBytes: number): string {
  return transferSizeBucket(totalBytes);
}

function getBrowserProperties(): TrackEventProperties {
  const userAgent = navigator.userAgent;
  return {
    browser: inferBrowser(userAgent),
    os: inferOs(userAgent),
    deviceType: inferDeviceType(userAgent),
  };
}

function compactProperties(
  properties: TrackEventProperties,
): Record<string, string | number | boolean | null> {
  const compacted: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) {
      compacted[key] = value;
    }
  }
  return compacted;
}

export function inferBrowser(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/chrome|crios/i.test(userAgent) && !/edg\//i.test(userAgent)) return "Chrome";
  if (/firefox|fxios/i.test(userAgent)) return "Firefox";
  if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) return "Safari";
  return "Unknown";
}

export function inferOs(userAgent: string): string {
  if (/windows nt/i.test(userAgent)) return "Windows";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  if (/android/i.test(userAgent)) return "Android";
  if (/mac os x|macintosh/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Unknown";
}

function inferDeviceType(userAgent: string): string {
  if (/ipad|tablet/i.test(userAgent)) return "tablet";
  if (/mobile|iphone|android/i.test(userAgent)) return "phone";
  return "desktop";
}
