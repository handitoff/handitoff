import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOSTED_ABUSE_LIMITS,
  createTurnAbuseTracker,
  evaluateAbuseSignal,
} from "./index.js";

describe("evaluateAbuseSignal", () => {
  it("allows a well-behaved signal", () => {
    const decision = evaluateAbuseSignal({
      ipAddress: "1.2.3.4",
      sessionCount: 1,
      signalingMessagesPerMinute: 10,
    });

    expect(decision).toBe("allow");
  });

  it("blocks when session count exceeds the limit", () => {
    const decision = evaluateAbuseSignal({
      ipAddress: "1.2.3.4",
      sessionCount: DEFAULT_HOSTED_ABUSE_LIMITS.maxActiveSessionsPerIp + 1,
      signalingMessagesPerMinute: 0,
    });

    expect(decision).toBe("block");
  });

  it("blocks when signaling rate exceeds the limit", () => {
    const decision = evaluateAbuseSignal({
      ipAddress: "1.2.3.4",
      sessionCount: 1,
      signalingMessagesPerMinute:
        DEFAULT_HOSTED_ABUSE_LIMITS.maxSignalingMessagesPerMinutePerSession + 1,
    });

    expect(decision).toBe("block");
  });

  it("allows exactly at the limit", () => {
    const decision = evaluateAbuseSignal({
      ipAddress: "1.2.3.4",
      sessionCount: DEFAULT_HOSTED_ABUSE_LIMITS.maxActiveSessionsPerIp,
      signalingMessagesPerMinute:
        DEFAULT_HOSTED_ABUSE_LIMITS.maxSignalingMessagesPerMinutePerSession,
    });

    expect(decision).toBe("allow");
  });

  it("respects custom limits", () => {
    const decision = evaluateAbuseSignal(
      { ipAddress: "1.2.3.4", sessionCount: 2, signalingMessagesPerMinute: 0 },
      { ...DEFAULT_HOSTED_ABUSE_LIMITS, maxActiveSessionsPerIp: 1 },
    );

    expect(decision).toBe("block");
  });
});

describe("createTurnAbuseTracker", () => {
  it("allows requests within the window limit", () => {
    const tracker = createTurnAbuseTracker(
      { ...DEFAULT_HOSTED_ABUSE_LIMITS, maxTurnRequestsPerMinutePerIp: 3 },
      () => 0,
    );

    expect(tracker.hit("1.2.3.4")).toBe("allow");
    expect(tracker.hit("1.2.3.4")).toBe("allow");
    expect(tracker.hit("1.2.3.4")).toBe("allow");
  });

  it("blocks requests that exceed the window limit", () => {
    const tracker = createTurnAbuseTracker(
      { ...DEFAULT_HOSTED_ABUSE_LIMITS, maxTurnRequestsPerMinutePerIp: 2 },
      () => 0,
    );

    tracker.hit("1.2.3.4");
    tracker.hit("1.2.3.4");
    expect(tracker.hit("1.2.3.4")).toBe("block");
  });

  it("tracks IPs independently", () => {
    const tracker = createTurnAbuseTracker(
      { ...DEFAULT_HOSTED_ABUSE_LIMITS, maxTurnRequestsPerMinutePerIp: 1 },
      () => 0,
    );

    tracker.hit("1.2.3.4");
    expect(tracker.hit("1.2.3.4")).toBe("block");
    expect(tracker.hit("5.6.7.8")).toBe("allow");
  });

  it("resets window after the window period", () => {
    let nowMs = 0;
    const tracker = createTurnAbuseTracker(
      { ...DEFAULT_HOSTED_ABUSE_LIMITS, maxTurnRequestsPerMinutePerIp: 1 },
      () => nowMs,
    );

    tracker.hit("1.2.3.4");
    expect(tracker.hit("1.2.3.4")).toBe("block");

    nowMs = 60_001;
    expect(tracker.hit("1.2.3.4")).toBe("allow");
  });

  it("clears all state on reset", () => {
    const tracker = createTurnAbuseTracker(
      { ...DEFAULT_HOSTED_ABUSE_LIMITS, maxTurnRequestsPerMinutePerIp: 1 },
      () => 0,
    );

    tracker.hit("1.2.3.4");
    tracker.reset();
    expect(tracker.hit("1.2.3.4")).toBe("allow");
  });
});
