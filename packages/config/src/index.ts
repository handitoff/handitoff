export type PublicConfig = {
  appUrl: string;
  apiUrl: string;
  wsUrl: string;
  billing: {
    enabled: boolean;
  };
  limits: {
    unpairedSessionTtlSeconds: number;
    pairedSessionTtlSeconds: number;
    maxFilesPerTransfer: number;
    maxRecommendedFileSizeBytes: number;
  };
  features: {
    turnEnabled: boolean;
    multiDeviceRooms: boolean;
    accounts: boolean;
  };
};

export type ServerConfig = {
  publicConfig: PublicConfig;
  redisUrl?: string;
  rateLimits: {
    maxActiveSessionsPerIp: number;
    maxJoinAttemptsPerPublicCode: number;
    maxSignalingMessagesPerMinutePerSession: number;
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
  billing: {
    enabled: false,
  },
  limits: {
    unpairedSessionTtlSeconds: 10 * 60,
    pairedSessionTtlSeconds: 30 * 60,
    maxFilesPerTransfer: 100,
    maxRecommendedFileSizeBytes: 2 * 1024 * 1024 * 1024,
  },
  features: {
    turnEnabled: false,
    multiDeviceRooms: false,
    accounts: false,
  },
};

const DEFAULT_RATE_LIMITS: ServerConfig["rateLimits"] = {
  maxActiveSessionsPerIp: 5,
  maxJoinAttemptsPerPublicCode: 10,
  maxSignalingMessagesPerMinutePerSession: 300,
};

export function loadPublicConfig(env: ConfigEnv = process.env): PublicConfig {
  const config: PublicConfig = {
    appUrl: readString(env, "HANDITOFF_APP_URL", DEFAULT_PUBLIC_CONFIG.appUrl),
    apiUrl: readString(env, "HANDITOFF_API_URL", DEFAULT_PUBLIC_CONFIG.apiUrl),
    wsUrl: readString(env, "HANDITOFF_WS_URL", DEFAULT_PUBLIC_CONFIG.wsUrl),
    billing: {
      enabled: readBoolean(env, "HANDITOFF_BILLING_ENABLED", false),
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
      maxRecommendedFileSizeBytes: readPositiveInteger(
        env,
        "HANDITOFF_MAX_RECOMMENDED_FILE_SIZE_BYTES",
        DEFAULT_PUBLIC_CONFIG.limits.maxRecommendedFileSizeBytes,
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
  const config: ServerConfig = {
    publicConfig: loadPublicConfig(env),
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

  return config;
}

export function assertValidPublicConfig(config: PublicConfig): void {
  const issues: string[] = [];

  requireUrl(config.appUrl, "appUrl", issues);
  requireUrl(config.apiUrl, "apiUrl", issues);
  requireWsUrl(config.wsUrl, "wsUrl", issues);
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
  requirePositiveInteger(
    config.limits.maxRecommendedFileSizeBytes,
    "limits.maxRecommendedFileSizeBytes",
    issues,
  );

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }
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

function requirePositiveInteger(value: number, field: string, issues: string[]): void {
  if (!Number.isInteger(value) || value <= 0) {
    issues.push(`${field} must be a positive integer`);
  }
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}
