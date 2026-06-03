export const DEFAULT_MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024 * 1024;
export const DEFAULT_MAX_TOTAL_TRANSFER_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

export type AccountPlan = "free" | "account" | "pro";

export type PlanLimits = PublicConfig["limits"];

export const PLAN_LIMITS: Record<AccountPlan, PlanLimits> = {
  free: {
    unpairedSessionTtlSeconds: 15 * 60,
    pairedSessionTtlSeconds: 15 * 60,
    maxFilesPerTransfer: 25,
    maxFileSizeBytes: 2 * 1024 * 1024 * 1024,
    maxRecommendedFileSizeBytes: 2 * 1024 * 1024 * 1024,
    maxTotalTransferSizeBytes: 2 * 1024 * 1024 * 1024,
  },
  account: {
    unpairedSessionTtlSeconds: 60 * 60,
    pairedSessionTtlSeconds: 60 * 60,
    maxFilesPerTransfer: 50,
    maxFileSizeBytes: 5 * 1024 * 1024 * 1024,
    maxRecommendedFileSizeBytes: 5 * 1024 * 1024 * 1024,
    maxTotalTransferSizeBytes: 10 * 1024 * 1024 * 1024,
  },
  pro: {
    unpairedSessionTtlSeconds: 8 * 60 * 60,
    pairedSessionTtlSeconds: 8 * 60 * 60,
    maxFilesPerTransfer: 500,
    maxFileSizeBytes: Number.MAX_SAFE_INTEGER,
    maxRecommendedFileSizeBytes: Number.MAX_SAFE_INTEGER,
    maxTotalTransferSizeBytes: Number.MAX_SAFE_INTEGER,
  },
};

export type PublicConfig = {
  appUrl: string;
  apiUrl: string;
  wsUrl: string;
  iceServers: PublicIceServer[];
  billing: {
    enabled: boolean;
  };
  analytics: {
    enabled: boolean;
  };
  limits: {
    unpairedSessionTtlSeconds: number;
    pairedSessionTtlSeconds: number;
    maxFilesPerTransfer: number;
    maxFileSizeBytes: number;
    maxRecommendedFileSizeBytes: number;
    maxTotalTransferSizeBytes: number;
  };
  features: {
    turnEnabled: boolean;
    multiDeviceRooms: boolean;
    accounts: boolean;
  };
};

export type PublicIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type ServerConfig = {
  publicConfig: PublicConfig;
  redisUrl?: string;
  databaseUrl?: string;
  adminToken?: string;
  auth: {
    sessionSecret: string;
    google?: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    };
  };
  rateLimits: {
    maxActiveSessionsPerIp: number;
    maxJoinAttemptsPerPublicCode: number;
    maxSignalingMessagesPerMinutePerSession: number;
  };
  turn?: {
    secret: string;
    urls: string[];
    credentialTtlSeconds: number;
  };
};

export type ConfigEnv = Record<string, string | undefined>;

export class ConfigError extends Error {
  public readonly issues: string[];

  public constructor(issues: string[]) {
    super(`Invalid configuration: ${issues.join("; ")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  appUrl: "http://localhost:5173",
  apiUrl: "http://localhost:8787",
  wsUrl: "ws://localhost:8787/ws",
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  billing: {
    enabled: false,
  },
  analytics: {
    enabled: false,
  },
  limits: {
    unpairedSessionTtlSeconds: 10 * 60,
    pairedSessionTtlSeconds: 30 * 60,
    maxFilesPerTransfer: 25,
    maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
    maxRecommendedFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
    maxTotalTransferSizeBytes: DEFAULT_MAX_TOTAL_TRANSFER_SIZE_BYTES,
  },
  features: {
    turnEnabled: false,
    multiDeviceRooms: false,
    accounts: false,
  },
};

const DEFAULT_RATE_LIMITS: ServerConfig["rateLimits"] = {
  maxActiveSessionsPerIp: 50,
  maxJoinAttemptsPerPublicCode: 10,
  maxSignalingMessagesPerMinutePerSession: 300,
};

export function loadPublicConfig(env: ConfigEnv = process.env): PublicConfig {
  const lanHost = emptyToUndefined(env.HANDITOFF_LAN_HOST);
  const lanDefaults =
    lanHost === undefined
      ? DEFAULT_PUBLIC_CONFIG
      : {
          ...DEFAULT_PUBLIC_CONFIG,
          appUrl: `http://${lanHost}:5173`,
          apiUrl: `http://${lanHost}:8787`,
          wsUrl: `ws://${lanHost}:8787/ws`,
        };
  const config: PublicConfig = {
    appUrl: readString(env, "HANDITOFF_APP_URL", lanDefaults.appUrl),
    apiUrl: readString(env, "HANDITOFF_API_URL", lanDefaults.apiUrl),
    wsUrl: readString(env, "HANDITOFF_WS_URL", lanDefaults.wsUrl),
    iceServers: readIceServers(env, "HANDITOFF_ICE_SERVERS", lanDefaults.iceServers),
    billing: {
      enabled: readBoolean(env, "HANDITOFF_BILLING_ENABLED", false),
    },
    analytics: {
      enabled: readBoolean(env, "HANDITOFF_ANALYTICS_ENABLED", false),
    },
    limits: {
      unpairedSessionTtlSeconds: readPositiveInteger(
        env,
        "HANDITOFF_UNPAIRED_SESSION_TTL_SECONDS",
        DEFAULT_PUBLIC_CONFIG.limits.unpairedSessionTtlSeconds,
      ),
      pairedSessionTtlSeconds: readPositiveInteger(
        env,
        "HANDITOFF_PAIRED_SESSION_TTL_SECONDS",
        DEFAULT_PUBLIC_CONFIG.limits.pairedSessionTtlSeconds,
      ),
      maxFilesPerTransfer: readPositiveInteger(
        env,
        "HANDITOFF_MAX_FILES_PER_TRANSFER",
        DEFAULT_PUBLIC_CONFIG.limits.maxFilesPerTransfer,
      ),
      maxFileSizeBytes: readPositiveInteger(
        env,
        "HANDITOFF_MAX_FILE_SIZE_BYTES",
        readPositiveInteger(
          env,
          "HANDITOFF_MAX_RECOMMENDED_FILE_SIZE_BYTES",
          DEFAULT_PUBLIC_CONFIG.limits.maxFileSizeBytes,
        ),
      ),
      maxRecommendedFileSizeBytes: readPositiveInteger(
        env,
        "HANDITOFF_MAX_RECOMMENDED_FILE_SIZE_BYTES",
        readPositiveInteger(
          env,
          "HANDITOFF_MAX_FILE_SIZE_BYTES",
          DEFAULT_PUBLIC_CONFIG.limits.maxRecommendedFileSizeBytes,
        ),
      ),
      maxTotalTransferSizeBytes: readPositiveInteger(
        env,
        "HANDITOFF_MAX_TOTAL_TRANSFER_SIZE_BYTES",
        DEFAULT_PUBLIC_CONFIG.limits.maxTotalTransferSizeBytes,
      ),
    },
    features: {
      turnEnabled: readBoolean(env, "HANDITOFF_TURN_ENABLED", false),
      multiDeviceRooms: readBoolean(env, "HANDITOFF_MULTI_DEVICE_ROOMS", false),
      accounts: readBoolean(env, "HANDITOFF_ACCOUNTS", false),
    },
  };

  assertValidPublicConfig(config);
  return config;
}

export function loadServerConfig(env: ConfigEnv = process.env): ServerConfig {
  const redisUrl = emptyToUndefined(env.HANDITOFF_REDIS_URL);
  const databaseUrl = emptyToUndefined(env.DATABASE_URL);
  const adminToken = emptyToUndefined(env.HANDITOFF_ADMIN_TOKEN);
  const sessionSecret = readString(env, "HANDITOFF_AUTH_SESSION_SECRET", "dev-session-secret");
  const googleClientId = emptyToUndefined(env.GOOGLE_OAUTH_CLIENT_ID);
  const googleClientSecret = emptyToUndefined(env.GOOGLE_OAUTH_CLIENT_SECRET);
  const googleRedirectUri = emptyToUndefined(env.GOOGLE_OAUTH_REDIRECT_URI);
  const turnSecret = emptyToUndefined(env.HANDITOFF_TURN_SECRET);
  const turnUrls = readStringArray(env, "HANDITOFF_TURN_URLS");
  const config: ServerConfig = {
    publicConfig: loadPublicConfig(env),
    auth: {
      sessionSecret,
    },
    rateLimits: {
      maxActiveSessionsPerIp: readPositiveInteger(
        env,
        "HANDITOFF_MAX_ACTIVE_SESSIONS_PER_IP",
        DEFAULT_RATE_LIMITS.maxActiveSessionsPerIp,
      ),
      maxJoinAttemptsPerPublicCode: readPositiveInteger(
        env,
        "HANDITOFF_MAX_JOIN_ATTEMPTS_PER_PUBLIC_CODE",
        DEFAULT_RATE_LIMITS.maxJoinAttemptsPerPublicCode,
      ),
      maxSignalingMessagesPerMinutePerSession: readPositiveInteger(
        env,
        "HANDITOFF_MAX_SIGNALING_MESSAGES_PER_MINUTE_PER_SESSION",
        DEFAULT_RATE_LIMITS.maxSignalingMessagesPerMinutePerSession,
      ),
    },
  };

  if (redisUrl !== undefined) {
    config.redisUrl = redisUrl;
  }
  if (databaseUrl !== undefined) {
    config.databaseUrl = databaseUrl;
  }
  if (adminToken !== undefined) {
    config.adminToken = adminToken;
  }
  if (
    googleClientId !== undefined &&
    googleClientSecret !== undefined &&
    googleRedirectUri !== undefined
  ) {
    config.auth.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      redirectUri: googleRedirectUri,
    };
  }

  if (turnSecret !== undefined && turnUrls.length > 0) {
    config.turn = {
      secret: turnSecret,
      urls: turnUrls,
      credentialTtlSeconds: readPositiveInteger(env, "HANDITOFF_TURN_CREDENTIAL_TTL_SECONDS", 600),
    };
  }

  return config;
}

export function assertValidPublicConfig(config: PublicConfig): void {
  const issues: string[] = [];

  requireUrl(config.appUrl, "appUrl", issues);
  requireUrl(config.apiUrl, "apiUrl", issues);
  requireWsUrl(config.wsUrl, "wsUrl", issues);
  requireIceServers(config.iceServers, issues);
  requirePositiveInteger(
    config.limits.unpairedSessionTtlSeconds,
    "limits.unpairedSessionTtlSeconds",
    issues,
  );
  requirePositiveInteger(
    config.limits.pairedSessionTtlSeconds,
    "limits.pairedSessionTtlSeconds",
    issues,
  );
  requirePositiveInteger(config.limits.maxFilesPerTransfer, "limits.maxFilesPerTransfer", issues);
  requirePositiveInteger(config.limits.maxFileSizeBytes, "limits.maxFileSizeBytes", issues);
  requirePositiveInteger(
    config.limits.maxRecommendedFileSizeBytes,
    "limits.maxRecommendedFileSizeBytes",
    issues,
  );
  requirePositiveInteger(
    config.limits.maxTotalTransferSizeBytes,
    "limits.maxTotalTransferSizeBytes",
    issues,
  );

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }
}

function readStringArray(env: ConfigEnv, key: string): string[] {
  const value = emptyToUndefined(env[key]);
  if (value === undefined) {
    return [];
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function readString(env: ConfigEnv, key: string, fallback: string): string {
  return emptyToUndefined(env[key]) ?? fallback;
}

function readBoolean(env: ConfigEnv, key: string, fallback: boolean): boolean {
  const value = emptyToUndefined(env[key]);
  if (value === undefined) {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new ConfigError([`${key} must be "true" or "false"`]);
}

function readPositiveInteger(env: ConfigEnv, key: string, fallback: number): number {
  const value = emptyToUndefined(env[key]);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError([`${key} must be a positive integer`]);
  }

  return parsed;
}

function readIceServers(
  env: ConfigEnv,
  key: string,
  fallback: PublicIceServer[],
): PublicIceServer[] {
  const value = emptyToUndefined(env[key]);
  if (value === undefined) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("not an array");
    }
    return parsed as PublicIceServer[];
  } catch {
    throw new ConfigError([`${key} must be a JSON array of ICE server definitions`]);
  }
}

function requireUrl(value: string, field: string, issues: string[]): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      issues.push(`${field} must use http or https`);
    }
  } catch {
    issues.push(`${field} must be a valid URL`);
  }
}

function requireWsUrl(value: string, field: string, issues: string[]): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      issues.push(`${field} must use ws or wss`);
    }
  } catch {
    issues.push(`${field} must be a valid WebSocket URL`);
  }
}

function requireIceServers(value: PublicIceServer[], issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push("iceServers must be an array");
    return;
  }

  for (const [index, server] of value.entries()) {
    if (typeof server !== "object" || server === null) {
      issues.push(`iceServers.${index} must be an object`);
      continue;
    }
    const urls = server.urls;
    const validUrls =
      typeof urls === "string" ||
      (Array.isArray(urls) && urls.every((url) => typeof url === "string"));
    if (!validUrls) {
      issues.push(`iceServers.${index}.urls must be a string or string array`);
    }
    if (server.username !== undefined && typeof server.username !== "string") {
      issues.push(`iceServers.${index}.username must be a string`);
    }
    if (server.credential !== undefined && typeof server.credential !== "string") {
      issues.push(`iceServers.${index}.credential must be a string`);
    }
  }
}

function requirePositiveInteger(value: number, field: string, issues: string[]): void {
  if (!Number.isInteger(value) || value <= 0) {
    issues.push(`${field} must be a positive integer`);
  }
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}
