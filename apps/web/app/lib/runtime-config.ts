import type { PublicConfig } from "@handitoff/protocol";

function defaultPublicConfig(): PublicConfig {
  const browserOrigin = typeof window === "undefined" ? undefined : window.location.origin;
  const browserProtocol = typeof window === "undefined" ? "http:" : window.location.protocol;
  const browserHost = typeof window === "undefined" ? "localhost" : window.location.hostname;
  const apiProtocol = browserProtocol === "https:" ? "https:" : "http:";
  const wsProtocol = browserProtocol === "https:" ? "wss:" : "ws:";

  return {
    appUrl: browserOrigin ?? "http://localhost:5173",
    apiUrl: `${apiProtocol}//${browserHost}:8787`,
    wsUrl: `${wsProtocol}//${browserHost}:8787/ws`,
    billing: { enabled: false },
    limits: {
      unpairedSessionTtlSeconds: 600,
      pairedSessionTtlSeconds: 1800,
      maxFilesPerTransfer: 100,
      maxRecommendedFileSizeBytes: 2 * 1024 * 1024 * 1024,
    },
    features: {
      turnEnabled: false,
      multiDeviceRooms: false,
      accounts: false,
    },
  };
}

const SERVER_DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  appUrl: "http://localhost:5173",
  apiUrl: "http://localhost:8787",
  wsUrl: "ws://localhost:8787/ws",
  billing: { enabled: false },
  limits: {
    unpairedSessionTtlSeconds: 600,
    pairedSessionTtlSeconds: 1800,
    maxFilesPerTransfer: 100,
    maxRecommendedFileSizeBytes: 2 * 1024 * 1024 * 1024,
  },
  features: {
    turnEnabled: false,
    multiDeviceRooms: false,
    accounts: false,
  },
};

declare global {
  interface Window {
    __HANDITOFF_PUBLIC_CONFIG__?: Partial<PublicConfig>;
  }
}

export function loadPublicRuntimeConfig(overrides?: Partial<PublicConfig>): PublicConfig {
  const runtimeOverrides =
    overrides ?? (typeof window === "undefined" ? undefined : window.__HANDITOFF_PUBLIC_CONFIG__);
  const defaults = typeof window === "undefined" ? SERVER_DEFAULT_PUBLIC_CONFIG : defaultPublicConfig();

  return {
    ...defaults,
    ...runtimeOverrides,
    billing: {
      ...defaults.billing,
      ...runtimeOverrides?.billing,
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
