import { describe, expect, it } from "vitest";

import {
  InMemoryAnalyticsSink,
  NoopAnalyticsSink,
  isAnalyticsEventName,
  sanitizeAnalyticsProperties,
  transferSizeBucket,
} from "./index.js";

describe("analytics sinks", () => {
  it("supports disabled no-op analytics", () => {
    const sink = new NoopAnalyticsSink();
    expect(sink.isEnabled()).toBe(false);
    expect(() =>
      sink.record({ eventName: "page_view", anonymousId: "anonymous-1" }),
    ).not.toThrow();
  });

  it("records normalized in-memory events", () => {
    const sink = new InMemoryAnalyticsSink();
    sink.record({
      eventName: "transfer_completed",
      anonymousId: " anonymous-1 ",
      sessionId: "session-1",
      transferId: "transfer-1",
      properties: { fileName: "secret.jpg", totalBytes: 12 },
    });

    expect(sink.events[0]).toEqual({
      eventName: "transfer_completed",
      anonymousId: "anonymous-1",
      sessionId: "session-1",
      transferId: "transfer-1",
      properties: { totalBytes: 12 },
    });
  });
});

describe("isAnalyticsEventName", () => {
  it("accepts known events only", () => {
    expect(isAnalyticsEventName("session_created")).toBe(true);
    expect(isAnalyticsEventName("posthog_capture")).toBe(false);
  });
});

describe("sanitizeAnalyticsProperties", () => {
  it("removes private transfer and session material", () => {
    expect(
      sanitizeAnalyticsProperties({
        browser: "Chrome",
        os: "macOS",
        deviceType: "desktop",
        eventName: "safe",
        failureCode: "ice_failed",
        fileName: "passport.pdf",
        filename: "passport.pdf",
        name: "passport.pdf",
        localPath: "/Users/person/passport.pdf",
        hash: "abc",
        content: "bytes",
        previewUrl: "blob:http://example",
        qrCode: "ABC234",
        joinUrl: "https://handitoff.io/join/ABC234",
        nested: { ignored: true },
      }),
    ).toEqual({
      browser: "Chrome",
      os: "macOS",
      deviceType: "desktop",
      eventName: "safe",
      failureCode: "ice_failed",
    });
  });
});

describe("transferSizeBucket", () => {
  const MB = 1024 * 1024;
  const GB = 1024 * MB;

  it("uses product analytics size ranges", () => {
    expect(transferSizeBucket(0)).toBe("0-10MB");
    expect(transferSizeBucket(10 * MB)).toBe("10-100MB");
    expect(transferSizeBucket(100 * MB)).toBe("100-500MB");
    expect(transferSizeBucket(500 * MB)).toBe("500MB-1GB");
    expect(transferSizeBucket(GB)).toBe("1GB+");
  });
});
