import { describe, expect, it } from "vitest";

import {
  InMemoryAnalyticsSink,
  NoopAnalyticsSink,
  transferCountBucket,
  transferSizeBucket,
} from "./index.js";

describe("NoopAnalyticsSink", () => {
  it("is disabled", () => {
    expect(new NoopAnalyticsSink().isEnabled()).toBe(false);
  });

  it("accepts events without throwing", () => {
    const sink = new NoopAnalyticsSink();
    expect(() => sink.record({ name: "session_created" })).not.toThrow();
  });
});

describe("InMemoryAnalyticsSink", () => {
  it("is enabled", () => {
    expect(new InMemoryAnalyticsSink().isEnabled()).toBe(true);
  });

  it("records events", () => {
    const sink = new InMemoryAnalyticsSink();
    sink.record({ name: "session_created" });
    sink.record({ name: "pair_approved" });

    expect(sink.events).toHaveLength(2);
    expect(sink.events[0]).toEqual({ name: "session_created" });
    expect(sink.events[1]).toEqual({ name: "pair_approved" });
  });

  it("records transfer events with buckets", () => {
    const sink = new InMemoryAnalyticsSink();
    sink.record({ name: "transfer_completed", sizeBucket: "small", countBucket: "one" });

    expect(sink.events[0]).toEqual({
      name: "transfer_completed",
      sizeBucket: "small",
      countBucket: "one",
    });
  });

  it("does not record file names, file contents, or identifiers", () => {
    const sink = new InMemoryAnalyticsSink();
    sink.record({ name: "session_ended" });

    const event = sink.events[0]!;
    const keys = Object.keys(event);
    expect(keys).not.toContain("fileName");
    expect(keys).not.toContain("fileContent");
    expect(keys).not.toContain("sessionId");
    expect(keys).not.toContain("deviceId");
    expect(keys).not.toContain("ipAddress");
  });
});

describe("transferSizeBucket", () => {
  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;

  it("buckets tiny files under 100 KB", () => {
    expect(transferSizeBucket(0)).toBe("tiny");
    expect(transferSizeBucket(99 * KB)).toBe("tiny");
  });

  it("buckets small files 100 KB to 10 MB", () => {
    expect(transferSizeBucket(100 * KB)).toBe("small");
    expect(transferSizeBucket(9 * MB + 999 * KB)).toBe("small");
  });

  it("buckets medium files 10 MB to 100 MB", () => {
    expect(transferSizeBucket(10 * MB)).toBe("medium");
    expect(transferSizeBucket(99 * MB + 999 * KB)).toBe("medium");
  });

  it("buckets large files 100 MB to 1 GB", () => {
    expect(transferSizeBucket(100 * MB)).toBe("large");
    expect(transferSizeBucket(GB - 1)).toBe("large");
  });

  it("buckets huge files 1 GB and above", () => {
    expect(transferSizeBucket(GB)).toBe("huge");
    expect(transferSizeBucket(10 * GB)).toBe("huge");
  });
});

describe("transferCountBucket", () => {
  it("one for a single file", () => {
    expect(transferCountBucket(1)).toBe("one");
  });

  it("few for 2 to 5 files", () => {
    expect(transferCountBucket(2)).toBe("few");
    expect(transferCountBucket(5)).toBe("few");
  });

  it("many for 6 or more files", () => {
    expect(transferCountBucket(6)).toBe("many");
    expect(transferCountBucket(100)).toBe("many");
  });
});
