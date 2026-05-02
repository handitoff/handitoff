import { createHmac } from "node:crypto";

export type TurnCredentialConfig = {
  enabled: boolean;
  ttlSeconds: number;
};

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export const DEFAULT_TURN_CREDENTIAL_TTL_SECONDS = 10 * 60;

export type TurnIssueOptions = {
  secret: string;
  urls: string[];
  ttlSeconds?: number;
  now?: () => number;
};

export function issueTurnCredential(options: TurnIssueOptions): IceServer {
  const ttl = options.ttlSeconds ?? DEFAULT_TURN_CREDENTIAL_TTL_SECONDS;
  const nowSeconds = Math.floor((options.now?.() ?? Date.now()) / 1000);
  const expiresAt = nowSeconds + ttl;
  const username = `${expiresAt}:handitoff`;
  const credential = createHmac("sha1", options.secret).update(username).digest("base64");
  return { urls: options.urls, username, credential };
}

export function parseTurnExpiresAt(username: string): number {
  const expiresAt = Number(username.split(":")[0]);
  if (!Number.isFinite(expiresAt)) {
    throw new Error("Invalid TURN username format");
  }
  return expiresAt;
}

export function isTurnCredentialExpired(username: string, now: () => number = Date.now): boolean {
  const expiresAt = parseTurnExpiresAt(username);
  return Math.floor(now() / 1000) >= expiresAt;
}
