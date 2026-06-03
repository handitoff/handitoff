import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { ServerConfig } from "@handitoff/config";
import { InMemoryAnalyticsSink } from "@handitoff/analytics";

import { createApiApp } from "./app.js";
import { InMemoryAccountStore, type AccountStore } from "./account-store.js";
import { FixedWindowRateLimiter } from "./rate-limits.js";
import { InMemorySessionStore } from "./session-store.js";

const config: ServerConfig = {
  publicConfig: {
    appUrl: "http://localhost:5173",
    apiUrl: "http://localhost:8787",
    wsUrl: "ws://localhost:8787/ws",
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    billing: { enabled: false },
    analytics: { enabled: true },
    limits: {
      unpairedSessionTtlSeconds: 60,
      pairedSessionTtlSeconds: 120,
      maxFilesPerTransfer: 100,
      maxFileSizeBytes: 1024,
      maxRecommendedFileSizeBytes: 1024,
      maxTotalTransferSizeBytes: 2048,
    },
    features: {
      turnEnabled: false,
      multiDeviceRooms: false,
      accounts: false,
    },
  },
  auth: {
    sessionSecret: "test-secret",
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
    const response = await app(
      new Request("http://localhost/api/health", { headers: { "x-request-id": "req-1" } }),
    );

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
    const response = await postJson(app, "/api/sessions", {
      hostDeviceId: "host-1",
      hostLabel: "Laptop",
    });
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

    const expiringStore = new InMemorySessionStore({
      codeGenerator: () => "GHJ456",
      now: () => now,
    });
    const expiringApp = createTestApp({ store: expiringStore, now: () => now });
    await postJson(expiringApp, "/api/sessions", { hostDeviceId: "host-2" });
    now += 61_000;
    const expiredResponse = await expiringApp(new Request("http://localhost/api/sessions/GHJ456"));
    expect(expiredResponse.status).toBe(410);
    await expect(expiredResponse.json()).resolves.toMatchObject({
      error: { code: "session_expired" },
    });
  });

  it("only host or guest can end a session", async () => {
    const store = new InMemorySessionStore({ codeGenerator: () => "ABC234" });
    const app = createTestApp({ store });
    await postJson(app, "/api/sessions", { hostDeviceId: "host-1" });
    const created = await store.getByPublicCode("ABC234");
    expect(created).toBeDefined();

    const missing = await postJson(app, "/api/sessions/missing/end", { deviceId: "host-1" });
    expect(missing.status).toBe(404);

    const forbidden = await postJson(app, `/api/sessions/${created?.id}/end`, {
      deviceId: "other",
    });
    expect(forbidden.status).toBe(403);

    const ended = await postJson(app, `/api/sessions/${created?.id}/end`, { deviceId: "host-1" });
    expect(ended.status).toBe(200);

    const alreadyEnded = await postJson(app, `/api/sessions/${created?.id}/end`, {
      deviceId: "host-1",
    });
    expect(alreadyEnded.status).toBe(409);
  });

  it("invokes expiry notifications when sessions expire", async () => {
    let now = 1_000;
    const onSessionExpired = vi.fn();
    const app = createTestApp({ now: () => now, onSessionExpired });

    await postJson(app, "/api/sessions", { hostDeviceId: "host-1" });
    now += 61_000;
    await app(new Request("http://localhost/api/config"));

    expect(onSessionExpired).toHaveBeenCalledWith("session-1", "ABC234");
  });

  it("rate limits join attempts per public code", async () => {
    const app = createTestApp();
    await postJson(app, "/api/sessions", { hostDeviceId: "host-1" });

    expect((await app(new Request("http://localhost/api/sessions/ABC234"))).status).toBe(200);
    expect((await app(new Request("http://localhost/api/sessions/ABC234"))).status).toBe(200);
    expect((await app(new Request("http://localhost/api/sessions/ABC234"))).status).toBe(429);
  });

  it("returns ice servers from getIceServers hook when provided", async () => {
    const dynamicIceServers = [
      { urls: "stun:stun.example.com:19302" },
      { urls: ["turn:turn.example.com:3478"], username: "user123", credential: "cred123" },
    ];
    const app = createApiApp({
      config,
      store: new InMemorySessionStore(),
      getIceServers: () => dynamicIceServers,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const response = await app(new Request("http://localhost/api/config"));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.iceServers).toEqual(dynamicIceServers);
  });

  it("returns static ice servers from config when no hook is provided", async () => {
    const app = createTestApp();
    const response = await app(new Request("http://localhost/api/config"));
    const body = (await response.json()) as Record<string, unknown>;

    expect(body.iceServers).toEqual(config.publicConfig.iceServers);
  });

  it("ingests allowlisted sanitized analytics events", async () => {
    const analytics = new InMemoryAnalyticsSink();
    const app = createApiApp({
      config,
      store: new InMemorySessionStore(),
      analytics,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const response = await postJson(app, "/api/analytics/events", {
      eventName: "transfer_completed",
      anonymousId: "anonymous-1",
      sessionId: "session-1",
      transferId: "transfer-1",
      properties: {
        browser: "Chrome",
        fileName: "secret.pdf",
        joinUrl: "https://handitoff.io/join/ABC234",
        totalBytes: 1024,
      },
    });

    expect(response.status).toBe(202);
    expect(analytics.events[0]).toEqual({
      eventName: "transfer_completed",
      anonymousId: "anonymous-1",
      sessionId: "session-1",
      transferId: "transfer-1",
      properties: { browser: "Chrome", totalBytes: 1024 },
    });
  });

  it("rejects unknown analytics event names", async () => {
    const analytics = new InMemoryAnalyticsSink();
    const app = createApiApp({
      config,
      store: new InMemorySessionStore(),
      analytics,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const response = await postJson(app, "/api/analytics/events", {
      eventName: "google_analytics",
      anonymousId: "anonymous-1",
    });

    expect(response.status).toBe(400);
    expect(analytics.events).toHaveLength(0);
  });

  it("protects admin analytics", async () => {
    const app = createApiApp({
      config: { ...config, adminToken: "secret" },
      analyticsDashboard: { getDashboard: vi.fn().mockResolvedValue({ ok: true }) },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    expect((await app(new Request("http://localhost/api/admin/analytics"))).status).toBe(403);

    const response = await app(
      new Request("http://localhost/api/admin/analytics?range=7d", {
        headers: { authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects duplicate account handles", async () => {
    const accountStore = new InMemoryAccountStore();
    const user = await accountStore.upsertOAuthUser({
      provider: "google",
      providerSubject: "google:user-1",
      email: "one@example.com",
      name: "One",
    });
    const other = await accountStore.upsertOAuthUser({
      provider: "google",
      providerSubject: "google:user-2",
      email: "two@example.com",
      name: "Two",
    });
    await accountStore.updateAccount(other.id, { handle: "taken" });
    const sessionId = await accountStore.createSession(
      user.id,
      new Date(Date.now() + 60_000),
    );
    const app = createTestApp({ accountStore });

    const response = await patchJson(
      app,
      "/api/account",
      { handle: "taken" },
      { cookie: signedSessionCookie(sessionId) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "handle_taken" } });
  });

  it("requires Pro before receive mode can be enabled", async () => {
    const accountStore = new InMemoryAccountStore();
    const user = await accountStore.upsertOAuthUser({
      provider: "google",
      providerSubject: "google:user-1",
      email: "one@example.com",
      name: "One",
    });
    const sessionId = await accountStore.createSession(
      user.id,
      new Date(Date.now() + 60_000),
    );
    const app = createTestApp({ accountStore });

    const response = await patchJson(
      app,
      "/api/account/receive",
      { receiveMode: true },
      { cookie: signedSessionCookie(sessionId) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "plan_required" } });
  });
});

function createTestApp(
  options: {
    store?: InMemorySessionStore;
    now?: () => number;
    codes?: string[];
    onSessionExpired?: (sessionId: string, publicCode: string) => void;
    accountStore?: AccountStore;
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
    ...(options.onSessionExpired === undefined
      ? {}
      : { onSessionExpired: options.onSessionExpired }),
    ...(options.accountStore === undefined ? {} : { accountStore: options.accountStore }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
}

function postJson(
  app: ReturnType<typeof createTestApp>,
  path: string,
  body: unknown,
): Promise<Response> {
  return app(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
      body: JSON.stringify(body),
    }),
  );
}

function patchJson(
  app: ReturnType<typeof createTestApp>,
  path: string,
  body: unknown,
  options: { cookie?: string } = {},
): Promise<Response> {
  return app(
    new Request(`http://localhost${path}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
      },
      body: JSON.stringify(body),
    }),
  );
}

function signedSessionCookie(sessionId: string): string {
  const signature = createHmac("sha256", config.auth.sessionSecret)
    .update(sessionId)
    .digest("base64url");
  return `handitoff_session=${sessionId}.${signature}`;
}
