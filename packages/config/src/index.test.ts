import { describe, expect, it } from "vitest";

import { ConfigError, loadPublicConfig, loadServerConfig } from "./index.js";

describe("loadPublicConfig", () => {
  it("uses safe self-host defaults", () => {
    const config = loadPublicConfig({});

    expect(config.billing.enabled).toBe(false);
    expect(config.features.turnEnabled).toBe(false);
    expect(config.features.multiDeviceRooms).toBe(false);
    expect(config.features.accounts).toBe(false);
    expect(config.limits.unpairedSessionTtlSeconds).toBe(600);
    expect(config.limits.pairedSessionTtlSeconds).toBe(1800);
  });

  it("loads hosted-style overrides", () => {
    const config = loadPublicConfig({
      HANDITOFF_APP_URL: "https://handitoff.io",
      HANDITOFF_API_URL: "https://api.handitoff.io",
      HANDITOFF_WS_URL: "wss://api.handitoff.io/ws",
      HANDITOFF_BILLING_ENABLED: "true",
      HANDITOFF_TURN_ENABLED: "true",
    });

    expect(config.appUrl).toBe("https://handitoff.io");
    expect(config.billing.enabled).toBe(true);
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
});
