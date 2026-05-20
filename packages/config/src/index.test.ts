import { describe, expect, it } from "vitest";

import {
  ConfigError,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_MAX_TOTAL_TRANSFER_SIZE_BYTES,
  loadPublicConfig,
  loadServerConfig,
} from "./index.js";

describe("loadPublicConfig", () => {
  it("uses safe self-host defaults", () => {
    const config = loadPublicConfig({});

    expect(config.billing.enabled).toBe(false);
    expect(config.analytics.enabled).toBe(false);
    expect(config.features.turnEnabled).toBe(false);
    expect(config.features.multiDeviceRooms).toBe(false);
    expect(config.features.accounts).toBe(false);
    expect(config.limits.unpairedSessionTtlSeconds).toBe(600);
    expect(config.limits.pairedSessionTtlSeconds).toBe(1800);
    expect(config.limits.maxFilesPerTransfer).toBe(25);
    expect(config.limits.maxFileSizeBytes).toBe(DEFAULT_MAX_FILE_SIZE_BYTES);
    expect(config.limits.maxRecommendedFileSizeBytes).toBe(DEFAULT_MAX_FILE_SIZE_BYTES);
    expect(config.limits.maxTotalTransferSizeBytes).toBe(DEFAULT_MAX_TOTAL_TRANSFER_SIZE_BYTES);
  });

  it("uses one shared file-size limit value with backwards-compatible env names", () => {
    expect(
      loadPublicConfig({ HANDITOFF_MAX_FILE_SIZE_BYTES: "1234" }).limits,
    ).toMatchObject({
      maxFileSizeBytes: 1234,
      maxRecommendedFileSizeBytes: 1234,
    });
    expect(
      loadPublicConfig({ HANDITOFF_MAX_RECOMMENDED_FILE_SIZE_BYTES: "5678" }).limits,
    ).toMatchObject({
      maxFileSizeBytes: 5678,
      maxRecommendedFileSizeBytes: 5678,
    });
  });

  it("loads hosted-style overrides", () => {
    const config = loadPublicConfig({
      HANDITOFF_APP_URL: "https://handitoff.io",
      HANDITOFF_API_URL: "https://api.handitoff.io",
      HANDITOFF_WS_URL: "wss://api.handitoff.io/ws",
      HANDITOFF_BILLING_ENABLED: "true",
      HANDITOFF_ANALYTICS_ENABLED: "true",
      HANDITOFF_TURN_ENABLED: "true",
    });

    expect(config.appUrl).toBe("https://handitoff.io");
    expect(config.billing.enabled).toBe(true);
    expect(config.analytics.enabled).toBe(true);
    expect(config.features.turnEnabled).toBe(true);
  });

  it("derives local network URLs from a LAN host", () => {
    const config = loadPublicConfig({
      HANDITOFF_LAN_HOST: "192.168.1.50",
    });

    expect(config.appUrl).toBe("http://192.168.1.50:5173");
    expect(config.apiUrl).toBe("http://192.168.1.50:8787");
    expect(config.wsUrl).toBe("ws://192.168.1.50:8787/ws");
  });

  it("lets explicit URLs override LAN host defaults", () => {
    const config = loadPublicConfig({
      HANDITOFF_LAN_HOST: "192.168.1.50",
      HANDITOFF_APP_URL: "http://devbox.local:5173",
    });

    expect(config.appUrl).toBe("http://devbox.local:5173");
    expect(config.apiUrl).toBe("http://192.168.1.50:8787");
  });

  it("fails loudly for invalid values", () => {
    expect(() =>
      loadPublicConfig({
        HANDITOFF_APP_URL: "not-a-url",
      }),
    ).toThrow(ConfigError);
  });
});

describe("loadServerConfig", () => {
  it("loads default rate limits", () => {
    const config = loadServerConfig({});

    expect(config.rateLimits.maxActiveSessionsPerIp).toBe(50);
    expect(config.rateLimits.maxJoinAttemptsPerPublicCode).toBe(10);
    expect(config.rateLimits.maxSignalingMessagesPerMinutePerSession).toBe(300);
  });

  it("loads private analytics server settings", () => {
    const config = loadServerConfig({
      DATABASE_URL: "postgres://localhost/handitoff",
      HANDITOFF_ADMIN_TOKEN: "secret",
    });

    expect(config.databaseUrl).toBe("postgres://localhost/handitoff");
    expect(config.adminToken).toBe("secret");
  });
});
