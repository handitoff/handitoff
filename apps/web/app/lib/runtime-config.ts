import type { PublicConfig } from "@handitoff/protocol";

const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
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

  return {
    ...DEFAULT_PUBLIC_CONFIG,
    ...runtimeOverrides,
    billing: {
      ...DEFAULT_PUBLIC_CONFIG.billing,
      ...runtimeOverrides?.billing,
    },
    limits: {
      ...DEFAULT_PUBLIC_CONFIG.limits,
      ...runtimeOverrides?.limits,
    },
    features: {
      ...DEFAULT_PUBLIC_CONFIG.features,
      ...runtimeOverrides?.features,
    },
  };
}

