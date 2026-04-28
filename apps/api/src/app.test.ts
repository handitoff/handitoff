import { describe, expect, it, vi } from "vitest";
import type { ServerConfig } from "@handitoff/config";

import { createApiApp } from "./app.js";
import { FixedWindowRateLimiter } from "./rate-limits.js";
import { InMemorySessionStore } from "./session-store.js";

const config: ServerConfig = {
  publicConfig: {
    appUrl: "http://localhost:5173",
    apiUrl: "http://localhost:8787",
    wsUrl: "ws://localhost:8787/ws",
    billing: { enabled: false },
    limits: {
      unpairedSessionTtlSeconds: 60,
      pairedSessionTtlSeconds: 120,
      maxFilesPerTransfer: 100,
      maxRecommendedFileSizeBytes: 1024,
    },
    features: {
      turnEnabled: false,
      multiDeviceRooms: false,
      accounts: false,
    },
  },
  rateLimits: {
    maxActiveSessionsPerIp: 2,
    maxJoinAttemptsPerPublicCode: 2,
    maxSignalingMessagesPerMinutePerSession: 300,
  },
};

describe("api app", () => {
  it("returns health with a request id", async () => {
    const app = createTestApp();
    const response = await app(new Request("http://localhost/api/health", { headers: { "x-request-id": "req-1" } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", requestId: "req-1" });
  });

  it("returns safe public config", async () => {
    const app = createTestApp();
    const response = await app(new Request("http://localhost/api/config"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(config.publicConfig);
  });

  it("creates a waiting session without exposing the internal id", async () => {
    const app = createTestApp();
    const response = await postJson(app, "/api/sessions", { hostDeviceId: "host-1", hostLabel: "Laptop" });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(body.publicCode).toBe("ABC234");
    expect(body.status).toBe("waiting");
    expect(body.joinUrl).toBe("http://localhost:5173/join/ABC234");
    expect(body).not.toHaveProperty("id");
  });

  it("rejects invalid device input", async () => {
    const app = createTestApp();
    const response = await postJson(app, "/api/sessions", { hostDeviceId: "" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_device" } });
  });

  it("rate limits active sessions per IP", async () => {
    const app = createTestApp({ codes: ["ABC234", "DEF345", "GHJ456"] });

    expect((await postJson(app, "/api/sessions", { hostDeviceId: "host-1" })).status).toBe(201);
    expect((await postJson(app, "/api/sessions", { hostDeviceId: "host-2" })).status).toBe(201);

    const blocked = await postJson(app, "/api/sessions", { hostDeviceId: "host-3" });
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({ error: { code: "rate_limited" } });
  });

  it("looks up a valid public session", async () => {
    const app = createTestApp();
    await postJson(app, "/api/sessions", { hostDeviceId: "host-1" });

    const response = await app(new Request("http://localhost/api/sessions/ABC234"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      publicCode: "ABC234",
      status: "waiting",
    });
  });

  it("returns missing, ended, and expired lookup states clearly", async () => {
    let now = 1_000;
    const store = new InMemorySessionStore({ codeGenerator: () => "ABC234", now: () => now });
    const app = createTestApp({ store, now: () => now });

    expect((await app(new Request("http://localhost/api/sessions/DEF345"))).status).toBe(404);

    await postJson(app, "/api/sessions", { hostDeviceId: "host-1" });
    const created = await store.getByPublicCode("ABC234");
    expect(created).toBeDefined();
    await postJson(app, `/api/sessions/${created?.id}/end`, { deviceId: "host-1" });
    expect((await app(new Request("http://localhost/api/sessions/ABC234"))).status).toBe(410);

    const expiringStore = new InMemorySessionStore({ codeGenerator: () => "GHJ456", now: () => now });
    const expiringApp = createTestApp({ store: expiringStore, now: () => now });
    await postJson(expiringApp, "/api/sessions", { hostDeviceId: "host-2" });
    now += 61_000;
    const expiredResponse = await expiringApp(new Request("http://localhost/api/sessions/GHJ456"));
    expect(expiredResponse.status).toBe(410);
    await expect(expiredResponse.json()).resolves.toMatchObject({ error: { code: "session_expired" } });
  });

  it("only host or guest can end a session", async () => {
    const store = new InMemorySessionStore({ codeGenerator: () => "ABC234" });
    const app = createTestApp({ store });
    await postJson(app, "/api/sessions", { hostDeviceId: "host-1" });
    const created = await store.getByPublicCode("ABC234");
    expect(created).toBeDefined();

    const missing = await postJson(app, "/api/sessions/missing/end", { deviceId: "host-1" });
    expect(missing.status).toBe(404);

    const forbidden = await postJson(app, `/api/sessions/${created?.id}/end`, { deviceId: "other" });
    expect(forbidden.status).toBe(403);

    const ended = await postJson(app, `/api/sessions/${created?.id}/end`, { deviceId: "host-1" });
    expect(ended.status).toBe(200);

    const alreadyEnded = await postJson(app, `/api/sessions/${created?.id}/end`, { deviceId: "host-1" });
    expect(alreadyEnded.status).toBe(409);
  });

  it("invokes expiry notifications when sessions expire", async () => {
    let now = 1_000;
    const onSessionExpired = vi.fn();
    const app = createTestApp({ now: () => now, onSessionExpired });

    await postJson(app, "/api/sessions", { hostDeviceId: "host-1" });
    now += 61_000;
    await app(new Request("http://localhost/api/health"));

    expect(onSessionExpired).toHaveBeenCalledWith("session-1", "ABC234");
  });

  it("rate limits join attempts per public code", async () => {
    const app = createTestApp();
    await postJson(app, "/api/sessions", { hostDeviceId: "host-1" });

    expect((await app(new Request("http://localhost/api/sessions/ABC234"))).status).toBe(200);
    expect((await app(new Request("http://localhost/api/sessions/ABC234"))).status).toBe(200);
    expect((await app(new Request("http://localhost/api/sessions/ABC234"))).status).toBe(429);
  });
});

function createTestApp(
  options: {
    store?: InMemorySessionStore;
    now?: () => number;
    codes?: string[];
    onSessionExpired?: (sessionId: string, publicCode: string) => void;
  } = {},
) {
  let id = 0;
  const codes = [...(options.codes ?? ["ABC234"])];
  const store =
    options.store ??
    new InMemorySessionStore({
      codeGenerator: () => codes.shift() ?? "ZZZ999",
      idGenerator: () => `session-${++id}`,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

  return createApiApp({
    config,
    store,
    ...(options.now === undefined ? {} : { now: options.now }),
    rateLimiter: new FixedWindowRateLimiter(options.now === undefined ? {} : { now: options.now }),
    ...(options.onSessionExpired === undefined ? {} : { onSessionExpired: options.onSessionExpired }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
}

function postJson(app: ReturnType<typeof createTestApp>, path: string, body: unknown): Promise<Response> {
  return app(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
      body: JSON.stringify(body),
    }),
  );
}
