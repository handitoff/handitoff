import { describe, expect, it } from "vitest";

import { InMemorySessionStore, RedisSessionStore, toPublicSession } from "./session-store.js";

describe("InMemorySessionStore", () => {
  it("keeps stored sessions immutable from callers", async () => {
    const store = new InMemorySessionStore({
      codeGenerator: () => "ABC234",
      idGenerator: () => "session-1",
      now: () => 1_000,
    });

    const created = await store.create({
      hostDeviceId: "host-1",
      hostLabel: "MacBook",
      hostIpKey: "203.0.113.10",
      ttlSeconds: 60,
    });
    created.hostDevice.label = "Mutated";

    await expect(store.getById("session-1")).resolves.toMatchObject({
      hostDevice: { label: "MacBook" },
    });
  });

  it("rejects public-code allocation after repeated collisions", async () => {
    const store = new InMemorySessionStore({
      codeGenerator: () => "ABC234",
      idGenerator: (() => {
        let id = 0;
        return () => `session-${++id}`;
      })(),
    });

    await store.create({
      hostDeviceId: "host-1",
      hostLabel: "MacBook",
      hostIpKey: "203.0.113.10",
      ttlSeconds: 60,
    });

    await expect(
      store.create({
        hostDeviceId: "host-2",
        hostLabel: "Windows PC",
        hostIpKey: "203.0.113.11",
        ttlSeconds: 60,
      }),
    ).rejects.toThrow("Unable to allocate a unique public session code.");
  });

  it("lets an attached guest end a session and excludes ended sessions from active counts", async () => {
    const store = new InMemorySessionStore({
      codeGenerator: () => "ABC234",
      idGenerator: () => "session-1",
      now: () => 1_000,
    });

    await store.create({
      hostDeviceId: "host-1",
      hostLabel: "MacBook",
      hostIpKey: "203.0.113.10",
      ttlSeconds: 60,
    });
    await store.attachGuest({
      sessionId: "session-1",
      guestDeviceId: "guest-1",
      guestLabel: "iPhone",
      ttlSeconds: 120,
    });

    await expect(store.end("session-1", "guest-1")).resolves.toMatchObject({ status: "ended" });
    await expect(store.countActiveByIp("203.0.113.10")).resolves.toBe(0);
  });

  it("returns only join-safe public session fields", async () => {
    const store = new InMemorySessionStore({
      codeGenerator: () => "ABC234",
      idGenerator: () => "session-1",
      now: () => 1_000,
    });
    const session = await store.create({
      hostDeviceId: "host-1",
      hostLabel: "MacBook",
      hostUserAgent: "Detailed UA",
      hostIpKey: "203.0.113.10",
      ttlSeconds: 60,
    });

    expect(toPublicSession(session)).toEqual({
      publicCode: "ABC234",
      status: "waiting",
      expiresAt: 61_000,
    });
  });
});

describe("RedisSessionStore", () => {
  it("persists sessions and public-code indexes with TTL", async () => {
    const redis = new FakeRedis();
    const store = new RedisSessionStore(redis, {
      codeGenerator: () => "ABC234",
      idGenerator: () => "session-1",
      now: () => 1_000,
    });

    await store.create({
      hostDeviceId: "host-1",
      hostLabel: "MacBook",
      hostIpKey: "203.0.113.10",
      ttlSeconds: 60,
    });

    expect(redis.ttls.get("handitoff:session:session-1")).toBe(60);
    expect(redis.ttls.get("handitoff:session-code:ABC234")).toBe(60);
    await expect(store.getByPublicCode("ABC234")).resolves.toMatchObject({
      id: "session-1",
      publicCode: "ABC234",
    });
  });

  it("renews TTL when a guest attaches", async () => {
    const redis = new FakeRedis();
    const store = new RedisSessionStore(redis, {
      codeGenerator: () => "ABC234",
      idGenerator: () => "session-1",
      now: () => 1_000,
    });

    await store.create({
      hostDeviceId: "host-1",
      hostLabel: "MacBook",
      hostIpKey: "203.0.113.10",
      ttlSeconds: 60,
    });
    await store.attachGuest({
      sessionId: "session-1",
      guestDeviceId: "guest-1",
      guestLabel: "iPhone",
      ttlSeconds: 120,
    });

    expect(redis.ttls.get("handitoff:session:session-1")).toBe(120);
    expect(redis.ttls.get("handitoff:session-code:ABC234")).toBe(120);
  });
});

class FakeRedis {
  public readonly values = new Map<string, string>();
  public readonly ttls = new Map<string, number>();

  public async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  public async set(key: string, value: string, mode?: "EX", ttlSeconds?: number): Promise<void> {
    this.values.set(key, value);
    if (mode === "EX" && ttlSeconds !== undefined) {
      this.ttls.set(key, ttlSeconds);
    }
  }

  public async del(key: string): Promise<void> {
    this.values.delete(key);
    this.ttls.delete(key);
  }

  public async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace("*", "");
    return [...this.values.keys()].filter((key) => key.startsWith(prefix));
  }
}
