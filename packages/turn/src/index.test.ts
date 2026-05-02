import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TURN_CREDENTIAL_TTL_SECONDS,
  isTurnCredentialExpired,
  issueTurnCredential,
  parseTurnExpiresAt,
} from "./index.js";

const SECRET = "test-turn-secret";
const URLS = ["turn:turn.example.com:3478", "turns:turn.example.com:5349"];
const FIXED_NOW = 1_700_000_000_000;

describe("issueTurnCredential", () => {
  it("returns urls, username, and credential", () => {
    const result = issueTurnCredential({ secret: SECRET, urls: URLS, now: () => FIXED_NOW });

    expect(result.urls).toEqual(URLS);
    expect(typeof result.username).toBe("string");
    expect(typeof result.credential).toBe("string");
  });

  it("username encodes the expiry timestamp", () => {
    const ttl = 600;
    const result = issueTurnCredential({ secret: SECRET, urls: URLS, ttlSeconds: ttl, now: () => FIXED_NOW });
    const expectedExpiry = Math.floor(FIXED_NOW / 1000) + ttl;

    expect(result.username).toBe(`${expectedExpiry}:handitoff`);
  });

  it("credential is HMAC-SHA1 of secret and username", () => {
    const result = issueTurnCredential({ secret: SECRET, urls: URLS, now: () => FIXED_NOW });
    const expected = createHmac("sha1", SECRET).update(result.username!).digest("base64");

    expect(result.credential).toBe(expected);
  });

  it("uses DEFAULT_TURN_CREDENTIAL_TTL_SECONDS when ttlSeconds is omitted", () => {
    const result = issueTurnCredential({ secret: SECRET, urls: URLS, now: () => FIXED_NOW });
    const expectedExpiry = Math.floor(FIXED_NOW / 1000) + DEFAULT_TURN_CREDENTIAL_TTL_SECONDS;

    expect(result.username).toBe(`${expectedExpiry}:handitoff`);
  });

  it("credential differs for different secrets", () => {
    const a = issueTurnCredential({ secret: "secret-a", urls: URLS, now: () => FIXED_NOW });
    const b = issueTurnCredential({ secret: "secret-b", urls: URLS, now: () => FIXED_NOW });

    expect(a.credential).not.toBe(b.credential);
  });

  it("credential differs across time", () => {
    const a = issueTurnCredential({ secret: SECRET, urls: URLS, now: () => FIXED_NOW });
    const b = issueTurnCredential({ secret: SECRET, urls: URLS, now: () => FIXED_NOW + 60_000 });

    expect(a.credential).not.toBe(b.credential);
  });
});

describe("parseTurnExpiresAt", () => {
  it("parses the expiry from a valid username", () => {
    const expiresAt = 1_700_001_000;
    expect(parseTurnExpiresAt(`${expiresAt}:handitoff`)).toBe(expiresAt);
  });

  it("throws for an invalid username", () => {
    expect(() => parseTurnExpiresAt("notanumber:handitoff")).toThrow();
  });
});

describe("isTurnCredentialExpired", () => {
  it("returns false before expiry", () => {
    const username = `${Math.floor(FIXED_NOW / 1000) + 600}:handitoff`;
    expect(isTurnCredentialExpired(username, () => FIXED_NOW)).toBe(false);
  });

  it("returns true after expiry", () => {
    const username = `${Math.floor(FIXED_NOW / 1000) - 1}:handitoff`;
    expect(isTurnCredentialExpired(username, () => FIXED_NOW)).toBe(true);
  });
});
