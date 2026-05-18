export const ANALYTICS_EVENT_NAMES = [
  "page_view",
  "session_created",
  "qr_visible",
  "join_page_opened",
  "join_requested",
  "peer_approved",
  "peer_rejected",
  "peer_connected",
  "peer_connection_failed",
  "connection_type_detected",
  "transfer_started",
  "transfer_completed",
  "transfer_failed",
  "transfer_cancelled",
  "session_expired",
  "session_ended",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export type AnalyticsProperties = Record<string, string | number | boolean | null>;

export type AnalyticsEventInput = {
  eventName: AnalyticsEventName;
  anonymousId: string;
  sessionId?: string;
  transferId?: string;
  properties?: unknown;
};

export interface AnalyticsSink {
  record(event: AnalyticsEventInput): void;
  isEnabled(): boolean;
}

export class NoopAnalyticsSink implements AnalyticsSink {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  record(_event: AnalyticsEventInput): void {
    return;
  }

  isEnabled(): boolean {
    return false;
  }
}

export class InMemoryAnalyticsSink implements AnalyticsSink {
  public readonly events: AnalyticsEventInput[] = [];

  record(event: AnalyticsEventInput): void {
    this.events.push(normalizeAnalyticsEvent(event));
  }

  isEnabled(): boolean {
    return true;
  }
}

export class ConsoleAnalyticsSink implements AnalyticsSink {
  record(event: AnalyticsEventInput): void {
    console.info({ at: "analytics", event: normalizeAnalyticsEvent(event) });
  }

  isEnabled(): boolean {
    return true;
  }
}

export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return (
    typeof value === "string" &&
    (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value)
  );
}

export function normalizeAnalyticsEvent(input: AnalyticsEventInput): AnalyticsEventInput {
  return {
    eventName: input.eventName,
    anonymousId: trimIdentifier(input.anonymousId),
    ...(input.sessionId === undefined ? {} : { sessionId: trimIdentifier(input.sessionId) }),
    ...(input.transferId === undefined ? {} : { transferId: trimIdentifier(input.transferId) }),
    properties: sanitizeAnalyticsProperties(input.properties ?? {}),
  };
}

export function sanitizeAnalyticsProperties(input: unknown): AnalyticsProperties {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }

  const output: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(input)) {
    if (isPrivateAnalyticsKey(key)) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      output[key] = typeof value === "string" ? value.slice(0, 256) : value;
    }
  }
  return output;
}

export function transferSizeBucket(totalBytes: number): string {
  const MB = 1024 * 1024;
  const GB = 1024 * MB;
  if (totalBytes < 10 * MB) return "0-10MB";
  if (totalBytes < 100 * MB) return "10-100MB";
  if (totalBytes < 500 * MB) return "100-500MB";
  if (totalBytes < GB) return "500MB-1GB";
  return "1GB+";
}

function isPrivateAnalyticsKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (normalized === "eventname") {
    return false;
  }
  return (
    normalized.includes("filename") ||
    normalized.includes("file_name") ||
    normalized === "name" ||
    normalized.includes("path") ||
    normalized.includes("hash") ||
    normalized.includes("content") ||
    normalized.includes("preview") ||
    normalized.includes("url") ||
    normalized.includes("qr") ||
    normalized === "code" ||
    normalized.includes("publiccode") ||
    normalized.includes("sessioncode")
  );
}

function trimIdentifier(value: string): string {
  return value.trim().slice(0, 128);
}
