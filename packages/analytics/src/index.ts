export type AnonymousAnalyticsEventName =
  | "session_created"
  | "pair_approved"
  | "pair_rejected"
  | "webrtc_connected"
  | "webrtc_failed"
  | "transfer_started"
  | "transfer_completed"
  | "transfer_failed"
  | "session_ended"
  | "session_expired";

export type TransferSizeBucket = "tiny" | "small" | "medium" | "large" | "huge";

export type TransferCountBucket = "one" | "few" | "many";

export type AnonymousAnalyticsEvent =
  | { name: "session_created" }
  | { name: "pair_approved" }
  | { name: "pair_rejected" }
  | { name: "webrtc_connected" }
  | { name: "webrtc_failed" }
  | {
      name: "transfer_started";
      sizeBucket: TransferSizeBucket;
      countBucket: TransferCountBucket;
    }
  | {
      name: "transfer_completed";
      sizeBucket: TransferSizeBucket;
      countBucket: TransferCountBucket;
    }
  | {
      name: "transfer_failed";
      sizeBucket: TransferSizeBucket;
      countBucket: TransferCountBucket;
    }
  | { name: "session_ended" }
  | { name: "session_expired" };

export interface AnalyticsSink {
  record(event: AnonymousAnalyticsEvent): void;
  isEnabled(): boolean;
}

export class NoopAnalyticsSink implements AnalyticsSink {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  record(_event: AnonymousAnalyticsEvent): void {
    return;
  }

  isEnabled(): boolean {
    return false;
  }
}

export class InMemoryAnalyticsSink implements AnalyticsSink {
  public readonly events: AnonymousAnalyticsEvent[] = [];

  record(event: AnonymousAnalyticsEvent): void {
    this.events.push(event);
  }

  isEnabled(): boolean {
    return true;
  }
}

export class ConsoleAnalyticsSink implements AnalyticsSink {
  record(event: AnonymousAnalyticsEvent): void {
    console.info({ at: "analytics", event });
  }

  isEnabled(): boolean {
    return true;
  }
}

export function transferSizeBucket(totalBytes: number): TransferSizeBucket {
  if (totalBytes < 100 * 1024) return "tiny";
  if (totalBytes < 10 * 1024 * 1024) return "small";
  if (totalBytes < 100 * 1024 * 1024) return "medium";
  if (totalBytes < 1024 * 1024 * 1024) return "large";
  return "huge";
}

export function transferCountBucket(count: number): TransferCountBucket {
  if (count === 1) return "one";
  if (count <= 5) return "few";
  return "many";
}
