import type { PublicConfig, PublicIceServer, ServerConfig } from "@handitoff/config";
import { loadServerConfig } from "@handitoff/config";
import { isPublicCode } from "@handitoff/protocol";
import type { HostedAbuseLimits } from "@handitoff/abuse";
import { evaluateAbuseSignal } from "@handitoff/abuse";
import {
  isAnalyticsEventName,
  normalizeAnalyticsEvent,
  type AnalyticsEventInput,
  type AnalyticsSink,
} from "@handitoff/analytics";

import { FixedWindowRateLimiter } from "./rate-limits.js";
import {
  InMemorySessionStore,
  toPublicSession,
  type CreateSessionInput,
  type SessionStore,
} from "./session-store.js";
import type { FeedbackInput, FeedbackStoreInterface } from "./feedback-store.js";

export type ApiAppOptions = {
  config?: ServerConfig;
  store?: SessionStore;
  rateLimiter?: FixedWindowRateLimiter;
  now?: () => number;
  onSessionExpired?: (sessionId: string, publicCode: string) => void;
  logger?: Pick<Console, "info" | "warn" | "error">;
  getIceServers?: () => Promise<PublicIceServer[]> | PublicIceServer[];
  analytics?: AnalyticsSink;
  analyticsDashboard?: AnalyticsDashboardStore;
  feedbackStore?: FeedbackStoreInterface;
  abuseLimits?: HostedAbuseLimits;
};

export type AnalyticsRange = "24h" | "7d" | "30d";

export type AnalyticsDashboardStore = {
  getDashboard(range: AnalyticsRange): Promise<unknown>;
};

type ApiErrorCode =
  | "analytics_unavailable"
  | "bad_json"
  | "forbidden"
  | "invalid_device"
  | "invalid_public_code"
  | "not_found"
  | "rate_limited"
  | "session_ended"
  | "session_expired";

type FeedbackBody = {
  type?: unknown;
  rating?: unknown;
  message?: unknown;
  sessionId?: unknown;
  errorCode?: unknown;
  connectionType?: unknown;
  browser?: unknown;
  os?: unknown;
  sessionState?: unknown;
  sizeBucket?: unknown;
  durationMs?: unknown;
};

type CreateSessionBody = {
  hostDeviceId?: unknown;
  hostLabel?: unknown;
};

type EndSessionBody = {
  deviceId?: unknown;
  reason?: unknown;
};

type AnalyticsEventBody = {
  eventName?: unknown;
  anonymousId?: unknown;
  sessionId?: unknown;
  transferId?: unknown;
  properties?: unknown;
};

export function createApiApp(options: ApiAppOptions = {}) {
  const config = options.config ?? loadServerConfig();
  const store = options.store ?? new InMemorySessionStore();
  const rateLimiter = options.rateLimiter ?? new FixedWindowRateLimiter();
  const now = options.now ?? Date.now;
  const logger = options.logger ?? console;
  const getIceServers = options.getIceServers;
  const analytics = options.analytics;
  const analyticsDashboard = options.analyticsDashboard;
  const abuseLimits = options.abuseLimits;

  return async function handleRequest(request: Request): Promise<Response> {
    const requestId = getRequestId(request);
    const url = new URL(request.url);
    const startedAt = now();

    try {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }), request);
      }

      if (request.method === "GET" && url.pathname === "/api/health") {
        return withCors(json({ status: "ok", requestId }, { requestId }), request);
      }

      const expiredSessions = await store.sweepExpired(now());
      for (const session of expiredSessions) {
        options.onSessionExpired?.(session.id, session.publicCode);
      }

      if (request.method === "GET" && url.pathname === "/api/config") {
        const iceServers = getIceServers ? await getIceServers() : config.publicConfig.iceServers;
        const resolvedConfig: PublicConfig = { ...config.publicConfig, iceServers };
        return withCors(json(publicConfig(resolvedConfig), { requestId }), request);
      }

      if (request.method === "POST" && url.pathname === "/api/sessions") {
        return withCors(
          await createSession(request, requestId, config, store, abuseLimits),
          request,
        );
      }

      if (request.method === "POST" && url.pathname === "/api/analytics/events") {
        return withCors(await recordAnalyticsEvent(request, requestId, analytics), request);
      }

      if (request.method === "POST" && url.pathname === "/api/feedback") {
        return withCors(await submitFeedback(request, requestId, options.feedbackStore), request);
      }

      if (request.method === "GET" && url.pathname === "/api/admin/analytics") {
        return withCors(
          await getAdminAnalytics(request, requestId, config.adminToken, analyticsDashboard),
          request,
        );
      }

      if (request.method === "GET" && url.pathname === "/api/admin/feedback") {
        return withCors(
          await getAdminFeedback(request, requestId, config.adminToken, options.feedbackStore),
          request,
        );
      }

      const lookupMatch = /^\/api\/sessions\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && lookupMatch?.[1] !== undefined) {
        return withCors(
          await lookupSession(request, requestId, lookupMatch[1], config, store, rateLimiter),
          request,
        );
      }

      const endMatch = /^\/api\/sessions\/([^/]+)\/end$/.exec(url.pathname);
      if (request.method === "POST" && endMatch?.[1] !== undefined) {
        return withCors(await endSession(request, requestId, endMatch[1], store), request);
      }

      return withCors(errorResponse("not_found", "Route not found.", 404, requestId), request);
    } finally {
      logger.info({
        at: "request",
        method: request.method,
        path: url.pathname,
        requestId,
        durationMs: now() - startedAt,
      });
    }
  };
}

async function createSession(
  request: Request,
  requestId: string,
  config: ServerConfig,
  store: SessionStore,
  abuseLimits: HostedAbuseLimits | undefined,
): Promise<Response> {
  const body = await readJson<CreateSessionBody>(request, requestId);
  if (body instanceof Response) {
    return body;
  }

  if (!isDeviceId(body.hostDeviceId)) {
    return errorResponse(
      "invalid_device",
      "hostDeviceId must be a non-empty string up to 128 characters.",
      400,
      requestId,
    );
  }

  const ipKey = getIpKey(request);
  const activeSessions = await store.countActiveByIp(ipKey);
  if (activeSessions >= config.rateLimits.maxActiveSessionsPerIp) {
    return errorResponse(
      "rate_limited",
      "Too many active sessions for this IP address.",
      429,
      requestId,
    );
  }

  if (abuseLimits !== undefined) {
    const decision = evaluateAbuseSignal(
      { ipAddress: ipKey, sessionCount: activeSessions, signalingMessagesPerMinute: 0 },
      abuseLimits,
    );
    if (decision === "block") {
      return errorResponse(
        "rate_limited",
        "Too many active sessions for this IP address.",
        429,
        requestId,
      );
    }
  }

  const hostUserAgent = trimToLength(request.headers.get("user-agent") ?? undefined, 256);
  const createInput: CreateSessionInput = {
    hostDeviceId: body.hostDeviceId,
    hostLabel: readOptionalLabel(body.hostLabel, "Host"),
    hostIpKey: ipKey,
    ttlSeconds: config.publicConfig.limits.unpairedSessionTtlSeconds,
    ...(hostUserAgent === undefined ? {} : { hostUserAgent }),
  };
  const session = await store.create(createInput);

  return json(
    {
      publicCode: session.publicCode,
      status: session.status,
      expiresAt: session.expiresAt,
      joinUrl: new URL(`/join/${session.publicCode}`, config.publicConfig.appUrl).toString(),
    },
    { requestId, status: 201 },
  );
}

async function lookupSession(
  request: Request,
  requestId: string,
  rawPublicCode: string,
  config: ServerConfig,
  store: SessionStore,
  rateLimiter: FixedWindowRateLimiter,
): Promise<Response> {
  const publicCode = rawPublicCode.toUpperCase();
  if (!isPublicCode(publicCode)) {
    return errorResponse("invalid_public_code", "Public code format is invalid.", 400, requestId);
  }

  const limit = rateLimiter.hit(
    `join:${publicCode}:${getIpKey(request)}`,
    config.rateLimits.maxJoinAttemptsPerPublicCode,
    60_000,
  );
  if (!limit.allowed) {
    return errorResponse(
      "rate_limited",
      "Too many join attempts for this public code.",
      429,
      requestId,
      {
        resetAt: limit.resetAt,
      },
    );
  }

  const session = await store.getByPublicCode(publicCode, { includeExpired: true });
  if (session === undefined) {
    return errorResponse("not_found", "Session not found.", 404, requestId);
  }
  if (session.status === "expired") {
    return errorResponse("session_expired", "Session has expired.", 410, requestId);
  }
  if (session.status === "ended") {
    return errorResponse("session_ended", "Session has ended.", 410, requestId);
  }

  return json(toPublicSession(session), { requestId });
}

async function endSession(
  request: Request,
  requestId: string,
  sessionId: string,
  store: SessionStore,
): Promise<Response> {
  const body = await readJson<EndSessionBody>(request, requestId);
  if (body instanceof Response) {
    return body;
  }
  if (!isDeviceId(body.deviceId)) {
    return errorResponse(
      "invalid_device",
      "deviceId must be a non-empty string up to 128 characters.",
      400,
      requestId,
    );
  }

  const existing = await store.getById(sessionId, { includeExpired: true });
  if (existing === undefined) {
    return errorResponse("not_found", "Session not found.", 404, requestId);
  }
  if (existing.status === "ended") {
    return errorResponse("session_ended", "Session has already ended.", 409, requestId);
  }

  const session = await store.end(
    sessionId,
    body.deviceId,
    typeof body.reason === "string" ? trimToLength(body.reason, 128) : undefined,
  );
  if (session === undefined) {
    return errorResponse("forbidden", "Device is not allowed to end this session.", 403, requestId);
  }

  return json(toPublicSession(session), { requestId });
}

async function recordAnalyticsEvent(
  request: Request,
  requestId: string,
  analytics: AnalyticsSink | undefined,
): Promise<Response> {
  if (analytics === undefined || !analytics.isEnabled()) {
    return json({ ok: true }, { requestId, status: 202 });
  }

  const body = await readJson<AnalyticsEventBody>(request, requestId);
  if (body instanceof Response) {
    return body;
  }

  if (!isAnalyticsEventName(body.eventName)) {
    return errorResponse("bad_json", "eventName is not allowed.", 400, requestId);
  }
  if (!isNonEmptyString(body.anonymousId, 128)) {
    return errorResponse("bad_json", "anonymousId is required.", 400, requestId);
  }
  if (body.sessionId !== undefined && !isNonEmptyString(body.sessionId, 128)) {
    return errorResponse("bad_json", "sessionId is invalid.", 400, requestId);
  }
  if (body.transferId !== undefined && !isNonEmptyString(body.transferId, 128)) {
    return errorResponse("bad_json", "transferId is invalid.", 400, requestId);
  }

  try {
    const event: AnalyticsEventInput = normalizeAnalyticsEvent({
      eventName: body.eventName,
      anonymousId: body.anonymousId,
      ...(body.sessionId === undefined ? {} : { sessionId: body.sessionId }),
      ...(body.transferId === undefined ? {} : { transferId: body.transferId }),
      properties: body.properties,
    });
    analytics.record(event);
  } catch {
    return json({ ok: true }, { requestId, status: 202 });
  }

  return json({ ok: true }, { requestId, status: 202 });
}

async function getAdminAnalytics(
  request: Request,
  requestId: string,
  adminToken: string | undefined,
  analyticsDashboard: AnalyticsDashboardStore | undefined,
): Promise<Response> {
  if (adminToken === undefined || !isAuthorizedAdmin(request, adminToken)) {
    return errorResponse("forbidden", "Admin token is required.", 403, requestId);
  }
  if (analyticsDashboard === undefined) {
    return json(emptyDashboard(), { requestId });
  }

  const range = readAnalyticsRange(new URL(request.url).searchParams.get("range"));
  try {
    return json(await analyticsDashboard.getDashboard(range), { requestId });
  } catch {
    return errorResponse(
      "analytics_unavailable",
      "Analytics dashboard is unavailable.",
      503,
      requestId,
    );
  }
}

async function submitFeedback(
  request: Request,
  requestId: string,
  store: FeedbackStoreInterface | undefined,
): Promise<Response> {
  if (store === undefined) {
    return json({ ok: true }, { requestId, status: 202 });
  }

  const body = await readJson<FeedbackBody>(request, requestId);
  if (body instanceof Response) {
    return body;
  }

  if (body.type !== "feedback" && body.type !== "error_report") {
    return errorResponse("bad_json", "type must be 'feedback' or 'error_report'.", 400, requestId);
  }

  if (
    body.rating !== undefined &&
    (typeof body.rating !== "number" || body.rating < 1 || body.rating > 5)
  ) {
    return errorResponse("bad_json", "rating must be a number between 1 and 5.", 400, requestId);
  }

  const input: FeedbackInput = {
    type: body.type,
    ...(typeof body.rating === "number" ? { rating: Math.floor(body.rating) } : {}),
    ...(typeof body.message === "string" && body.message.trim() !== ""
      ? { message: body.message }
      : {}),
    ...(isNonEmptyString(body.sessionId, 128) ? { sessionId: body.sessionId } : {}),
    ...(isNonEmptyString(body.errorCode, 128) ? { errorCode: body.errorCode } : {}),
    ...(isNonEmptyString(body.connectionType, 64) ? { connectionType: body.connectionType } : {}),
    ...(isNonEmptyString(body.browser, 64) ? { browser: body.browser } : {}),
    ...(isNonEmptyString(body.os, 64) ? { os: body.os } : {}),
    ...(isNonEmptyString(body.sessionState, 128) ? { sessionState: body.sessionState } : {}),
    ...(isNonEmptyString(body.sizeBucket, 64) ? { sizeBucket: body.sizeBucket } : {}),
    ...(typeof body.durationMs === "number" ? { durationMs: Math.floor(body.durationMs) } : {}),
  };

  store.submit(input);
  return json({ ok: true }, { requestId, status: 202 });
}

async function getAdminFeedback(
  request: Request,
  requestId: string,
  adminToken: string | undefined,
  store: FeedbackStoreInterface | undefined,
): Promise<Response> {
  if (adminToken === undefined || !isAuthorizedAdmin(request, adminToken)) {
    return errorResponse("forbidden", "Admin token is required.", 403, requestId);
  }
  if (store === undefined) {
    return json({ feedback: [] }, { requestId });
  }

  try {
    const feedback = await store.getRecent(50);
    return json({ feedback: feedback.map(serializeFeedbackRow) }, { requestId });
  } catch {
    return errorResponse("analytics_unavailable", "Feedback data is unavailable.", 503, requestId);
  }
}

function serializeFeedbackRow(
  row: Awaited<ReturnType<FeedbackStoreInterface["getRecent"]>>[number],
) {
  return {
    ...row,
    id: row.id.toString(),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

function publicConfig(config: PublicConfig): PublicConfig {
  return config;
}

async function readJson<T>(request: Request, requestId: string): Promise<T | Response> {
  try {
    return (await request.json()) as T;
  } catch {
    return errorResponse("bad_json", "Request body must be valid JSON.", 400, requestId);
  }
}

function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get("origin");
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin ?? "*");
  headers.set("vary", "origin");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "authorization,content-type,x-admin-token,x-request-id",
  );
  headers.set("access-control-expose-headers", "x-request-id");
  if (origin !== null) {
    headers.set("access-control-allow-credentials", "true");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(body: unknown, options: { requestId: string; status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": options.requestId,
    },
  });
}

function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  requestId: string,
  extra: Record<string, unknown> = {},
): Response {
  return json({ error: { code, message, ...extra }, requestId }, { status, requestId });
}

function getRequestId(request: Request): string {
  return request.headers.get("x-request-id") ?? globalThis.crypto.randomUUID();
}

function getIpKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor === undefined || forwardedFor === "" ? "unknown" : forwardedFor;
}

function isDeviceId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128;
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function readAnalyticsRange(value: string | null): AnalyticsRange {
  return value === "7d" || value === "30d" ? value : value === "24h" ? value : "24h";
}

function isAuthorizedAdmin(request: Request, token: string): boolean {
  const authorization = request.headers.get("authorization");
  if (authorization === `Bearer ${token}`) {
    return true;
  }
  return request.headers.get("x-admin-token") === token;
}

function emptyDashboard() {
  return {
    summary: {
      sessionsCreated: 0,
      peersConnected: 0,
      transfersStarted: 0,
      transfersCompleted: 0,
      transferSuccessRate: 0,
      pairingSuccessRate: 0,
      averageTransferSize: 0,
      averageTransferDuration: 0,
      averageMbps: 0,
    },
    funnel: [],
    deviceEvents: [],
    sessionEvents: [],
    transferBatchEvents: [],
    fileEvents: [],
    connectionTypes: [],
    sizeBuckets: [],
    fileSizeBuckets: [],
    failures: [],
    browsers: [],
    operatingSystems: [],
    deviceTypes: [],
    recentFailedTransfers: [],
  };
}

function readOptionalLabel(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, 80) : fallback;
}

function trimToLength(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.trim().slice(0, maxLength);
}
