import { describe, expect, it } from "vitest";

import { inferDeviceLabel } from "./device";

describe("inferDeviceLabel", () => {
  it.each([
    [
      "iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      "iPhone",
    ],
    [
      "Android",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
      "Android Phone",
    ],
    ["Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 Safari/605.1.15", "MacBook"],
    ["iPad", "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "iPad"],
    ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "Windows PC"],
    ["Unknown", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "Unknown Device"],
  ])("labels %s user agents", (_name, userAgent, expected) => {
    expect(inferDeviceLabel(userAgent)).toBe(expected);
  });
});

