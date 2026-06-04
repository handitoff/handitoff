import { loadPublicConfig, type PublicConfig } from "@handitoff/config";
import {
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_MAX_TOTAL_TRANSFER_SIZE_BYTES,
} from "@handitoff/config";

function defaultPublicConfig(): PublicConfig {
  const browserOrigin = typeof window === "undefined" ? undefined : window.location.origin;
  const browserProtocol = typeof window === "undefined" ? "http:" : window.location.protocol;
  const browserHost =
    typeof window === "undefined"
      ? undefined
      : window.location.port === ""
        ? window.location.hostname
        : window.location.host;
  const sameOriginApiUrl =
    browserHost === undefined
      ? "http://localhost:8787"
      : `${browserProtocol === "https:" ? "https:" : "http:"}//${browserHost}`;
  const sameOriginWsUrl =
    browserHost === undefined
      ? "ws://localhost:8787/ws"
      : `${browserProtocol === "https:" ? "wss:" : "ws:"}//${browserHost}/ws`;

  return {
    appUrl: browserOrigin ?? "http://localhost:5173",
    apiUrl: sameOriginApiUrl,
    wsUrl: sameOriginWsUrl,
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    billing: { enabled: false },
    analytics: { enabled: false },
    limits: {
      unpairedSessionTtlSeconds: 600,
      pairedSessionTtlSeconds: 1800,
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
}

function serverDefaultPublicConfig(): PublicConfig {
  return loadPublicConfig();
}

declare global {
  interface Window {
    __HANDITOFF_PUBLIC_CONFIG__?: Partial<PublicConfig>;
  }
}

export function loadPublicRuntimeConfig(overrides?: Partial<PublicConfig>): PublicConfig {
  const runtimeOverrides =
    overrides ?? (typeof window === "undefined" ? undefined : window.__HANDITOFF_PUBLIC_CONFIG__);
  const defaults =
    typeof window === "undefined" ? serverDefaultPublicConfig() : defaultPublicConfig();

  return {
    ...defaults,
    ...runtimeOverrides,
    billing: {
      ...defaults.billing,
      ...runtimeOverrides?.billing,
    },
    analytics: {
      ...defaults.analytics,
      ...runtimeOverrides?.analytics,
    },
    limits: {
      ...defaults.limits,
      ...runtimeOverrides?.limits,
    },
    features: {
      ...defaults.features,
      ...runtimeOverrides?.features,
    },
  };
}

export function publicRuntimeConfigScript(config = loadPublicRuntimeConfig()): string {
  return `window.__HANDITOFF_PUBLIC_CONFIG__=${JSON.stringify(config).replaceAll("<", "\\u003c")};`;
}
