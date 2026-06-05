import { createHmac, timingSafeEqual } from "node:crypto";

import type { PublicConfig, PublicIceServer, ServerConfig } from "@handitoff/config";
import { loadServerConfig } from "@handitoff/config";
import { PLAN_LIMITS } from "@handitoff/config";
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
  type StoredSession,
} from "./session-store.js";
import type { FeedbackInput, FeedbackStoreInterface } from "./feedback-store.js";
import {
  AccountHandleTakenError,
  InMemoryAccountStore,
  type AccountDevice,
  type AccountStore,
  type AccountUser,
  type UpdateAccountInput,
  type UpdateReceiveSettingsInput,
} from "./account-store.js";

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
  accountStore?: AccountStore;
  abuseLimits?: HostedAbuseLimits;
  oauthFetch?: typeof fetch;
};

export type AnalyticsRange = "24h" | "7d" | "30d";

export type AnalyticsDashboardStore = {
  getDashboard(range: AnalyticsRange): Promise<unknown>;
};

type ApiErrorCode =
  | "analytics_unavailable"
  | "auth_unavailable"
  | "bad_json"
  | "forbidden"
  | "google_oauth_failed"
  | "invalid_device"
  | "invalid_public_code"
  | "handle_taken"
  | "not_found"
  | "plan_required"
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

type UpdateAccountBody = {
  name?: unknown;
  handle?: unknown;
  defaultDeviceName?: unknown;
};

type UpdateReceiveSettingsBody = {
  receiveMode?: unknown;
  requireSenderName?: unknown;
  allowSenderMessage?: unknown;
  requireSenderMessage?: unknown;
};

type RegisterDeviceBody = {
  deviceId?: unknown;
  label?: unknown;
  browser?: unknown;
  os?: unknown;
  deviceType?: unknown;
};

type RenameDeviceBody = {
  label?: unknown;
};

type GoogleTokenResponse = {
  access_token?: unknown;
};

type GoogleUserInfo = {
  sub?: unknown;
  email?: unknown;
  name?: unknown;
  picture?: unknown;
};

const ACCOUNT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

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
  const accountStore = options.accountStore ?? new InMemoryAccountStore();
  const oauthFetch = options.oauthFetch ?? globalThis.fetch.bind(globalThis);

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
        if (session.ownerUserId !== undefined && hasJoinedPeer(session)) {
          await accountStore.upsertHandoffSession({
            id: session.id,
            ownerUserId: session.ownerUserId,
            publicCode: session.publicCode,
            tier: session.tier ?? "free",
            status: "expired",
            createdAt: new Date(session.createdAt),
            endedAt: new Date(now()),
            endReason: "expired",
            participantCount: participantCount(session),
            connectedDeviceCount: 0,
          });
          await accountStore.recordHandoffActivity({
            userId: session.ownerUserId,
            sessionId: session.id,
            eventType: "session_expired",
            title: "Session expired",
            summary: "No devices connected",
            createdAt: new Date(now()),
          });
        }
        options.onSessionExpired?.(session.id, session.publicCode);
      }

      if (request.method === "GET" && url.pathname === "/api/config") {
        const iceServers = getIceServers ? await getIceServers() : config.publicConfig.iceServers;
        const accountUser = await requireAccountUser(request, accountStore, config);
        const resolvedConfig = publicConfigForAccount(
          { ...config.publicConfig, iceServers },
          accountUser,
        );
        return withCors(json(publicConfig(resolvedConfig), { requestId }), request);
      }

      if (request.method === "GET" && url.pathname === "/api/auth/google/start") {
        return withCors(await startGoogleOAuth(request, requestId, config), request);
      }

      if (request.method === "GET" && url.pathname === "/api/auth/google/callback") {
        return withCors(
          await completeGoogleOAuth(request, requestId, config, accountStore, oauthFetch),
          request,
        );
      }

      if (request.method === "GET" && url.pathname === "/api/auth/me") {
        return withCors(
          await getAuthenticatedAccount(request, requestId, accountStore, config),
          request,
        );
      }

      if (request.method === "POST" && url.pathname === "/api/auth/sign-out") {
        return withCors(await signOut(request, requestId, accountStore, config), request);
      }

      if (request.method === "PATCH" && url.pathname === "/api/account") {
        return withCors(await updateAccount(request, requestId, accountStore, config), request);
      }

      if (request.method === "PATCH" && url.pathname === "/api/account/receive") {
        return withCors(
          await updateReceiveSettings(request, requestId, accountStore, config),
          request,
        );
      }

      if (request.method === "GET" && url.pathname === "/api/account/devices") {
        return withCors(
          await listAccountDevices(request, requestId, accountStore, config),
          request,
        );
      }

      if (request.method === "POST" && url.pathname === "/api/account/devices") {
        return withCors(
          await registerAccountDevice(request, requestId, accountStore, config),
          request,
        );
      }

      const deviceMatch = /^\/api\/account\/devices\/([^/]+)$/.exec(url.pathname);
      if (deviceMatch?.[1] !== undefined) {
        if (request.method === "PATCH") {
          return withCors(
            await renameAccountDevice(request, requestId, accountStore, config, deviceMatch[1]),
            request,
          );
        }
        if (request.method === "DELETE") {
          return withCors(
            await removeAccountDevice(request, requestId, accountStore, config, deviceMatch[1]),
            request,
          );
        }
      }

      if (request.method === "POST" && url.pathname === "/api/sessions") {
        return withCors(
          await createSession(request, requestId, config, store, abuseLimits, accountStore),
          request,
        );
      }

      if (request.method === "POST" && url.pathname === "/api/analytics/events") {
        return withCors(
          await recordAnalyticsEvent(request, requestId, analytics, accountStore),
          request,
        );
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
        return withCors(
          await endSession(request, requestId, endMatch[1], store, accountStore),
          request,
        );
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
  accountStore: AccountStore,
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

  const accountUser = await requireAccountUser(request, accountStore, config);
  const planConfig = publicConfigForAccount(config.publicConfig, accountUser);
  const hostUserAgent = trimToLength(request.headers.get("user-agent") ?? undefined, 256);
  const createInput: CreateSessionInput = {
    hostDeviceId: body.hostDeviceId,
    hostLabel: readOptionalLabel(body.hostLabel, "Host"),
    hostIpKey: ipKey,
    ttlSeconds: planConfig.limits.unpairedSessionTtlSeconds,
    ...(accountUser === undefined ? {} : { ownerUserId: accountUser.id }),
    tier: accountUser?.plan === "pro" ? "pro" : accountUser === undefined ? "guest" : "free",
    ...(accountUser === undefined ? {} : { limits: planConfig.limits }),
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
  accountStore: AccountStore,
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
  if (session.ownerUserId !== undefined && hasJoinedPeer(session)) {
    await accountStore.upsertHandoffSession({
      id: session.id,
      ownerUserId: session.ownerUserId,
      publicCode: session.publicCode,
      tier: session.tier ?? "free",
      status: "ended",
      createdAt: new Date(session.createdAt),
      endedAt: new Date(session.endedAt ?? Date.now()),
      ...(session.endReason === undefined ? {} : { endReason: session.endReason }),
      participantCount: participantCount(session),
      connectedDeviceCount: 0,
    });
    await accountStore.recordHandoffActivity({
      userId: session.ownerUserId,
      sessionId: session.id,
      eventType: "session_ended",
      title: "Session ended",
      ...(session.endReason === undefined ? {} : { summary: session.endReason }),
      createdAt: new Date(session.endedAt ?? Date.now()),
    });
  }

  return json(toPublicSession(session), { requestId });
}

async function startGoogleOAuth(
  request: Request,
  requestId: string,
  config: ServerConfig,
): Promise<Response> {
  const google = config.auth.google;
  if (google === undefined) {
    return errorResponse("auth_unavailable", "Google sign-in is not configured.", 503, requestId);
  }

  const state = globalThis.crypto.randomUUID();
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", google.clientId);
  authorizationUrl.searchParams.set("redirect_uri", google.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("state", state);

  return redirect(authorizationUrl.toString(), {
    headers: [
      cookieHeader("handitoff_oauth_state", state, {
        maxAgeSeconds: 10 * 60,
        httpOnly: true,
        sameSite: "Lax",
        secure: isSecureRequest(request, config),
      }),
    ],
  });
}

async function completeGoogleOAuth(
  request: Request,
  requestId: string,
  config: ServerConfig,
  accountStore: AccountStore,
  oauthFetch: typeof fetch,
): Promise<Response> {
  const google = config.auth.google;
  if (google === undefined) {
    return errorResponse("auth_unavailable", "Google sign-in is not configured.", 503, requestId);
  }

  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const expectedState = readCookie(request, "handitoff_oauth_state");
  if (state === null || expectedState === undefined || state !== expectedState) {
    return errorResponse("forbidden", "OAuth state is invalid or expired.", 403, requestId);
  }

  const code = url.searchParams.get("code");
  if (code === null || code.trim() === "") {
    return errorResponse(
      "google_oauth_failed",
      "Google did not return an OAuth code.",
      400,
      requestId,
    );
  }

  const tokenResponse = await oauthFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: google.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    return errorResponse("google_oauth_failed", "Google token exchange failed.", 502, requestId);
  }

  const tokenBody = (await tokenResponse.json().catch(() => undefined)) as
    | GoogleTokenResponse
    | undefined;
  if (typeof tokenBody?.access_token !== "string") {
    return errorResponse(
      "google_oauth_failed",
      "Google token response was invalid.",
      502,
      requestId,
    );
  }

  const userInfoResponse = await oauthFetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokenBody.access_token}` },
  });
  if (!userInfoResponse.ok) {
    return errorResponse("google_oauth_failed", "Google user lookup failed.", 502, requestId);
  }

  const googleUser = (await userInfoResponse.json().catch(() => undefined)) as
    | GoogleUserInfo
    | undefined;
  if (
    typeof googleUser?.sub !== "string" ||
    typeof googleUser.email !== "string" ||
    typeof googleUser.name !== "string"
  ) {
    return errorResponse("google_oauth_failed", "Google user profile was invalid.", 502, requestId);
  }

  const user = await accountStore.upsertOAuthUser({
    provider: "google",
    providerSubject: `google:${googleUser.sub}`,
    email: googleUser.email,
    name: googleUser.name,
    ...(typeof googleUser.picture === "string" ? { avatarUrl: googleUser.picture } : {}),
  });
  const expiresAt = new Date(Date.now() + ACCOUNT_SESSION_MAX_AGE_SECONDS * 1000);
  const sessionId = await accountStore.createSession(user.id, expiresAt);
  const signedSession = signSessionId(sessionId, config.auth.sessionSecret);
  const destination = user.handle === undefined ? "/account/welcome" : "/account";

  return redirect(new URL(destination, config.publicConfig.appUrl).toString(), {
    headers: [
      cookieHeader("handitoff_oauth_state", "", {
        maxAgeSeconds: 0,
        httpOnly: true,
        sameSite: "Lax",
        secure: isSecureRequest(request, config),
      }),
      cookieHeader("handitoff_session", signedSession, {
        maxAgeSeconds: ACCOUNT_SESSION_MAX_AGE_SECONDS,
        httpOnly: true,
        sameSite: "Lax",
        secure: isSecureRequest(request, config),
      }),
    ],
  });
}

async function getAuthenticatedAccount(
  request: Request,
  requestId: string,
  accountStore: AccountStore,
  config: ServerConfig,
): Promise<Response> {
  const user = await requireAccountUser(request, accountStore, config);
  if (user === undefined) {
    return errorResponse("forbidden", "Sign in is required.", 401, requestId);
  }
  return json(await accountPayload(user, accountStore), { requestId });
}

async function signOut(
  request: Request,
  requestId: string,
  accountStore: AccountStore,
  config: ServerConfig,
): Promise<Response> {
  const sessionId = readSignedSessionId(request, config.auth.sessionSecret);
  if (sessionId !== undefined) {
    await accountStore.deleteSession(sessionId);
  }
  return json(
    { ok: true },
    {
      requestId,
      headers: [
        cookieHeader("handitoff_session", "", {
          maxAgeSeconds: 0,
          httpOnly: true,
          sameSite: "Lax",
          secure: isSecureRequest(request, config),
        }),
      ],
    },
  );
}

async function updateAccount(
  request: Request,
  requestId: string,
  accountStore: AccountStore,
  config: ServerConfig,
): Promise<Response> {
  const user = await requireAccountUser(request, accountStore, config);
  if (user === undefined) {
    return errorResponse("forbidden", "Sign in is required.", 401, requestId);
  }
  const body = await readJson<UpdateAccountBody>(request, requestId);
  if (body instanceof Response) {
    return body;
  }

  const input: UpdateAccountInput = {};
  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name, 120)) {
      return errorResponse("bad_json", "name must be a non-empty string.", 400, requestId);
    }
    input.name = body.name.trim();
  }
  if (body.handle !== undefined) {
    if (body.handle === null || body.handle === "") {
      input.handle = null;
    } else if (typeof body.handle === "string" && isValidHandle(body.handle)) {
      input.handle = normalizeHandle(body.handle);
    } else {
      return errorResponse(
        "bad_json",
        "handle must be 3-32 lowercase letters, numbers, or hyphens.",
        400,
        requestId,
      );
    }
  }
  if (body.defaultDeviceName !== undefined) {
    if (body.defaultDeviceName === null || body.defaultDeviceName === "") {
      input.defaultDeviceName = null;
    } else if (isNonEmptyString(body.defaultDeviceName, 80)) {
      input.defaultDeviceName = body.defaultDeviceName.trim();
    } else {
      return errorResponse(
        "bad_json",
        "defaultDeviceName must be a string up to 80 characters.",
        400,
        requestId,
      );
    }
  }

  try {
    const updated = await accountStore.updateAccount(user.id, input);
    return json(await accountPayload(updated, accountStore), { requestId });
  } catch (error) {
    if (error instanceof AccountHandleTakenError) {
      return errorResponse("handle_taken", "That handle is already taken.", 409, requestId);
    }
    throw error;
  }
}

async function updateReceiveSettings(
  request: Request,
  requestId: string,
  accountStore: AccountStore,
  config: ServerConfig,
): Promise<Response> {
  const user = await requireAccountUser(request, accountStore, config);
  if (user === undefined) {
    return errorResponse("forbidden", "Sign in is required.", 401, requestId);
  }
  const body = await readJson<UpdateReceiveSettingsBody>(request, requestId);
  if (body instanceof Response) {
    return body;
  }

  const input: UpdateReceiveSettingsInput = {};
  for (const key of [
    "receiveMode",
    "requireSenderName",
    "allowSenderMessage",
    "requireSenderMessage",
  ] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") {
        return errorResponse("bad_json", `${key} must be a boolean.`, 400, requestId);
      }
      input[key] = body[key];
    }
  }

  if (input.receiveMode === true && !canUseReceiveLink(user)) {
    return errorResponse("plan_required", "Receive links require the Pro plan.", 403, requestId);
  }

  const updated = await accountStore.updateReceiveSettings(user.id, input);
  return json(await accountPayload(updated, accountStore), { requestId });
}

async function listAccountDevices(
  request: Request,
  requestId: string,
  accountStore: AccountStore,
  config: ServerConfig,
): Promise<Response> {
  const user = await requireSignedInAccountUser(request, accountStore, config, requestId);
  if (user instanceof Response) {
    return user;
  }
  const currentDeviceId = new URL(request.url).searchParams.get("currentDeviceId") ?? undefined;
  const devices = await accountStore.listDevices(user.id);
  return json(
    { devices: devices.map((device) => devicePayload(device, currentDeviceId, Date.now())) },
    { requestId },
  );
}

async function registerAccountDevice(
  request: Request,
  requestId: string,
  accountStore: AccountStore,
  config: ServerConfig,
): Promise<Response> {
  const user = await requireSignedInAccountUser(request, accountStore, config, requestId);
  if (user instanceof Response) {
    return user;
  }
  const body = await readJson<RegisterDeviceBody>(request, requestId);
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

  const label = readOptionalLabel(body.label, user.defaultDeviceName ?? "This device");
  const userAgent = trimToLength(request.headers.get("user-agent") ?? undefined, 256);
  const browser = readOptionalMetadata(body.browser);
  const os = readOptionalMetadata(body.os);
  const deviceType = readOptionalMetadata(body.deviceType);
  const device = await accountStore.upsertDevice({
    id: body.deviceId,
    userId: user.id,
    label,
    ...(browser === undefined ? {} : { browser }),
    ...(os === undefined ? {} : { os }),
    ...(deviceType === undefined ? {} : { deviceType }),
    ...(userAgent === undefined ? {} : { userAgent }),
  });
  return json(
    { device: devicePayload(device, body.deviceId, Date.now()) },
    { requestId, status: 201 },
  );
}

async function renameAccountDevice(
  request: Request,
  requestId: string,
  accountStore: AccountStore,
  config: ServerConfig,
  encodedDeviceId: string,
): Promise<Response> {
  const user = await requireSignedInAccountUser(request, accountStore, config, requestId);
  if (user instanceof Response) {
    return user;
  }
  const body = await readJson<RenameDeviceBody>(request, requestId);
  if (body instanceof Response) {
    return body;
  }
  if (!isNonEmptyString(body.label, 80)) {
    return errorResponse(
      "bad_json",
      "label must be a non-empty string up to 80 characters.",
      400,
      requestId,
    );
  }
  const deviceId = decodeURIComponent(encodedDeviceId);
  const device = await accountStore.updateDeviceLabel(user.id, deviceId, body.label.trim());
  if (device === undefined) {
    return errorResponse("not_found", "Device not found.", 404, requestId);
  }
  return json({ device: devicePayload(device, deviceId, Date.now()) }, { requestId });
}

async function removeAccountDevice(
  request: Request,
  requestId: string,
  accountStore: AccountStore,
  config: ServerConfig,
  encodedDeviceId: string,
): Promise<Response> {
  const user = await requireSignedInAccountUser(request, accountStore, config, requestId);
  if (user instanceof Response) {
    return user;
  }
  const removed = await accountStore.removeDevice(user.id, decodeURIComponent(encodedDeviceId));
  if (!removed) {
    return errorResponse("not_found", "Device not found.", 404, requestId);
  }
  return json({ ok: true }, { requestId });
}

async function recordAnalyticsEvent(
  request: Request,
  requestId: string,
  analytics: AnalyticsSink | undefined,
  accountStore: AccountStore,
): Promise<Response> {
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
    if (analytics?.isEnabled()) {
      analytics.record(event);
    }
    await recordAccountTransferEvent(accountStore, event);
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

function publicConfigForAccount(config: PublicConfig, user: AccountUser | undefined): PublicConfig {
  if (user === undefined) {
    return config;
  }
  return { ...config, limits: PLAN_LIMITS[user.plan] };
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
  headers.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
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

function json(
  body: unknown,
  options: { requestId: string; status?: number; headers?: string[] },
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "x-request-id": options.requestId,
  });
  for (const cookie of options.headers ?? []) {
    headers.append("set-cookie", cookie);
  }
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers,
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

function redirect(location: string, options: { headers?: string[] } = {}): Response {
  const headers = new Headers({ location });
  for (const cookie of options.headers ?? []) {
    headers.append("set-cookie", cookie);
  }
  return new Response(null, { status: 302, headers });
}

async function requireAccountUser(
  request: Request,
  accountStore: AccountStore,
  config: ServerConfig,
): Promise<AccountUser | undefined> {
  const sessionId = readSignedSessionId(request, config.auth.sessionSecret);
  if (sessionId === undefined) {
    return undefined;
  }
  return accountStore.getUserBySession(sessionId);
}

async function requireSignedInAccountUser(
  request: Request,
  accountStore: AccountStore,
  config: ServerConfig,
  requestId: string,
): Promise<AccountUser | Response> {
  const user = await requireAccountUser(request, accountStore, config);
  if (user === undefined) {
    return errorResponse("forbidden", "Sign in is required.", 401, requestId);
  }
  return user;
}

async function accountPayload(user: AccountUser, accountStore: AccountStore) {
  const receiveLinkEnabled = canUseReceiveLink(user);
  const sessions = await accountStore.listHandoffSessions(user.id);
  const recentActivity = await accountStore.listRecentActivity(user.id);
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      ...(user.avatarUrl === undefined ? {} : { avatarUrl: user.avatarUrl }),
      ...(user.handle === undefined ? {} : { handle: user.handle }),
      ...(user.defaultDeviceName === undefined
        ? {}
        : { defaultDeviceName: user.defaultDeviceName }),
      plan: user.plan,
      provider: user.provider,
      createdAt: user.createdAt.toISOString(),
    },
    receive: {
      receiveMode: receiveLinkEnabled && user.receiveMode,
      online: receiveLinkEnabled,
      requireSenderName: user.requireSenderName,
      allowSenderMessage: user.allowSenderMessage,
      requireSenderMessage: user.requireSenderMessage,
    },
    requests: [],
    liveReceive: [],
    sessions: sessions.map(sessionPayload),
    recentActivity: recentActivity.map(activityPayload),
  };
}

function sessionPayload(session: Awaited<ReturnType<AccountStore["listHandoffSessions"]>>[number]) {
  return {
    id: session.id,
    code: session.code,
    type: session.type,
    tier: session.tier,
    status: session.status,
    fileCount: session.fileCount,
    totalSize: session.totalSize,
    participantCount: session.participantCount,
    connectedDeviceCount: session.connectedDeviceCount,
    deviceLabels: session.deviceLabels,
    planTier: session.planTier,
    createdAt: session.createdAt.toISOString(),
    ...(session.endedAt === undefined ? {} : { endedAt: session.endedAt.toISOString() }),
    ...(session.durationMs === undefined ? {} : { durationMs: session.durationMs }),
    ...(session.success === undefined ? {} : { success: session.success }),
    ...(session.connectionType === undefined ? {} : { connectionType: session.connectionType }),
    ...(session.peerLabel === undefined ? {} : { peerLabel: session.peerLabel }),
    ...(session.endReason === undefined ? {} : { endReason: session.endReason }),
    ...(session.failureReason === undefined ? {} : { failureReason: session.failureReason }),
  };
}

function activityPayload(session: Awaited<ReturnType<AccountStore["listRecentActivity"]>>[number]) {
  return {
    id: session.id,
    sessionId: session.sessionId,
    eventType: session.eventType,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
    ...(session.transferId === undefined ? {} : { transferId: session.transferId }),
    ...(session.summary === undefined ? {} : { summary: session.summary }),
    ...(session.fileCount === undefined ? {} : { fileCount: session.fileCount }),
    ...(session.totalSize === undefined ? {} : { totalSize: session.totalSize }),
    ...(session.sizeBucket === undefined ? {} : { sizeBucket: session.sizeBucket }),
    ...(session.deviceLabel === undefined ? {} : { deviceLabel: session.deviceLabel }),
    ...(session.peerLabel === undefined ? {} : { peerLabel: session.peerLabel }),
  };
}

function devicePayload(device: AccountDevice, currentDeviceId: string | undefined, now: number) {
  const lastSeenAt = device.lastSeenAt.getTime();
  return {
    id: device.id,
    label: device.label,
    ...(device.browser === undefined ? {} : { browser: device.browser }),
    ...(device.os === undefined ? {} : { os: device.os }),
    ...(device.deviceType === undefined ? {} : { deviceType: device.deviceType }),
    ...(device.userAgent === undefined ? {} : { userAgent: device.userAgent }),
    online: now - lastSeenAt <= 45_000,
    thisDevice: currentDeviceId === device.id,
    lastSeenAt: device.lastSeenAt.toISOString(),
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  };
}

function participantCount(session: StoredSession): number {
  return session.guestDeviceId === undefined ? 1 : 2;
}

function hasJoinedPeer(session: StoredSession): boolean {
  return session.guestDeviceId !== undefined;
}

function canUseReceiveLink(user: AccountUser): boolean {
  return user.plan === "pro";
}

function readSignedSessionId(request: Request, secret: string): string | undefined {
  const signed = readCookie(request, "handitoff_session");
  if (signed === undefined) {
    return undefined;
  }
  const separatorIndex = signed.lastIndexOf(".");
  if (separatorIndex <= 0) {
    return undefined;
  }
  const sessionId = signed.slice(0, separatorIndex);
  const signature = signed.slice(separatorIndex + 1);
  const expected = hmac(sessionId, secret);
  if (!safeEqual(signature, expected)) {
    return undefined;
  }
  return sessionId;
}

function signSessionId(sessionId: string, secret: string): string {
  return `${sessionId}.${hmac(sessionId, secret)}`;
}

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (cookie === null) {
    return undefined;
  }
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return undefined;
}

function cookieHeader(
  name: string,
  value: string,
  options: { maxAgeSeconds: number; httpOnly: boolean; sameSite: "Lax"; secure: boolean },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${options.maxAgeSeconds}`,
    `SameSite=${options.sameSite}`,
  ];
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function isSecureRequest(request: Request, config: ServerConfig): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto !== null) {
    return forwardedProto.split(",")[0]?.trim() === "https";
  }
  return config.publicConfig.appUrl.startsWith("https://");
}

function normalizeHandle(value: string): string {
  return value.trim().toLowerCase();
}

function isValidHandle(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(normalizeHandle(value));
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

async function recordAccountTransferEvent(
  accountStore: AccountStore,
  event: AnalyticsEventInput,
): Promise<void> {
  if (event.sessionId === undefined) {
    return;
  }
  const transferStatus = transferStatusForEvent(event.eventName);
  const ownerUserId = await accountStore.getHandoffSessionOwner(event.sessionId);
  const properties: Record<string, unknown> =
    typeof event.properties === "object" &&
    event.properties !== null &&
    !Array.isArray(event.properties)
      ? (event.properties as Record<string, unknown>)
      : {};
  const transferId = event.transferId ?? `${event.sessionId}:${event.eventName}:${Date.now()}`;
  const fileCount = readNumberProperty(properties, ["fileCount", "files", "count"]);
  const totalSize = readNumberProperty(properties, ["totalBytes", "totalSize", "bytes"]);
  const sizeBucket = readStringProperty(properties, ["sizeBucket"]);
  const connectionType = readConnectionType(properties);
  const failureReason = readStringProperty(properties, ["failureReason", "reason", "code"]);
  const durationMs = readNumberProperty(properties, ["durationMs"]);

  if (transferStatus !== undefined) {
    await accountStore.recordTransferMetadata({
      sessionId: event.sessionId,
      transferId,
      status: transferStatus,
      ...(fileCount === undefined ? {} : { fileCount }),
      ...(totalSize === undefined ? {} : { totalSize }),
      ...(sizeBucket === undefined ? {} : { sizeBucket }),
      ...(connectionType === undefined ? {} : { connectionType }),
      ...(failureReason === undefined ? {} : { failureReason }),
      ...(durationMs === undefined ? {} : { durationMs }),
      occurredAt: new Date(),
    });
  }

  if (ownerUserId !== undefined) {
    const activity = activityForAnalyticsEvent(event.eventName);
    if (activity !== undefined) {
      await accountStore.recordHandoffActivity({
        userId: ownerUserId,
        sessionId: event.sessionId,
        transferId,
        eventType: event.eventName,
        title: activity.title,
        ...(fileCount === undefined ? {} : { fileCount }),
        ...(totalSize === undefined ? {} : { totalSize }),
        ...(sizeBucket === undefined ? {} : { sizeBucket }),
        ...(activity.summary === undefined ? {} : { summary: activity.summary }),
        createdAt: new Date(),
      });
    }
  }
}

function transferStatusForEvent(
  eventName: AnalyticsEventInput["eventName"],
): "started" | "completed" | "failed" | "cancelled" | undefined {
  if (eventName === "transfer_started" || eventName === "transfer_batch_started") return "started";
  if (eventName === "transfer_completed" || eventName === "transfer_batch_completed") {
    return "completed";
  }
  if (eventName === "transfer_failed" || eventName === "transfer_batch_failed") return "failed";
  if (eventName === "transfer_cancelled" || eventName === "transfer_batch_cancelled") {
    return "cancelled";
  }
  return undefined;
}

function activityForAnalyticsEvent(
  eventName: AnalyticsEventInput["eventName"],
): { title: string; summary?: string } | undefined {
  switch (eventName) {
    case "transfer_completed":
    case "transfer_batch_completed":
      return { title: "Transfer completed" };
    case "transfer_failed":
    case "transfer_batch_failed":
      return { title: "Transfer failed" };
    case "transfer_cancelled":
    case "transfer_batch_cancelled":
      return { title: "Transfer cancelled" };
    case "session_peer_connected":
    case "peer_connected":
      return { title: "Peer connected" };
    case "session_ended":
      return { title: "Session ended" };
    case "session_expired":
      return { title: "Session expired" };
    default:
      return undefined;
  }
}

function readNumberProperty(
  properties: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
  }
  return undefined;
}

function readStringProperty(
  properties: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim().slice(0, 128);
    }
  }
  return undefined;
}

function readConnectionType(properties: Record<string, unknown>): "direct" | "relay" | undefined {
  const value = readStringProperty(properties, ["connectionType"]);
  return value === "direct" || value === "relay" ? value : undefined;
}

function readOptionalLabel(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, 80) : fallback;
}

function readOptionalMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, 80) : undefined;
}

function trimToLength(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.trim().slice(0, maxLength);
}
