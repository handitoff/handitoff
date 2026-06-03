// ─────────────────────────────────────────────────────────────────────────────
// Account data contract + mock data.
//
// This file is the seam between the account UI and the backend. The UI reads
// everything through `useAccount()` / the exported types below. When the backend
// lands, replace `MOCK_ACCOUNT` / `MOCK_SESSIONS` / `MOCK_RECEIVE_REQUESTS` with
// real data (loader data, fetchers, websocket events) and keep the shapes intact.
// Nothing in the UI assumes the data is mock.
// ─────────────────────────────────────────────────────────────────────────────

export type Plan = "free" | "account" | "pro";

export type OAuthProvider = "google" | "github" | "apple";

export type AccountUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  /** Claimed receive handle — the `username` in handitoff.io/to/username. */
  handle?: string;
  /** How other devices see this person during a transfer. */
  defaultDeviceName?: string;
  plan: Plan;
  provider: OAuthProvider;
  /** ISO timestamp. */
  createdAt: string;
};

export type ReceiveSettings = {
  /** Master switch — is the link accepting requests right now. */
  receiveMode: boolean;
  /** Whether the owner's tab is open / reachable. */
  online: boolean;
  requireSenderName: boolean;
  allowSenderMessage: boolean;
  requireSenderMessage: boolean;
};

export type ReceiveRequest = {
  id: string;
  senderName?: string;
  message?: string;
  fileCount?: number;
  totalSize?: number;
  /** ISO timestamp. */
  requestedAt: string;
};

export type ReceiveSessionLive = {
  id: string;
  senderName: string;
  fileCount: number;
  totalSize: number;
  /** ISO timestamp the session started. */
  startedAt: string;
};

export type SessionStatus =
  | "waiting"
  | "connected"
  | "transferring"
  | "ended"
  | "expired"
  | "failed";

export type SessionType = "standard" | "receive";

export type SessionTier = "guest" | "free" | "pro";

export type HandoffSession = {
  id: string;
  /** Public pairing code, e.g. "7F2K9". */
  code: string;
  type: SessionType;
  tier: SessionTier;
  status: SessionStatus;
  fileCount: number;
  /** Bytes. */
  totalSize: number;
  /** Milliseconds, when known. */
  durationMs?: number;
  success?: boolean;
  connectionType?: "direct" | "relay";
  peerLabel?: string;
  /** ISO timestamp. */
  createdAt: string;
};

export type PlanEntitlements = {
  label: string;
  maxFileSize: string;
  sessionDuration: string;
  maxDevices: string;
  maxConcurrentSenders: string;
  receiveLink: boolean;
  priorityRelay: boolean;
};

export const PLAN_ENTITLEMENTS: Record<Plan, PlanEntitlements> = {
  free: {
    label: "Free",
    maxFileSize: "2 GB per file",
    sessionDuration: "15 minutes",
    maxDevices: "2 devices",
    maxConcurrentSenders: "1 sender",
    receiveLink: false,
    priorityRelay: false,
  },
  account: {
    label: "Account",
    maxFileSize: "Standard limit",
    sessionDuration: "Standard session",
    maxDevices: "2 devices",
    maxConcurrentSenders: "1 sender",
    receiveLink: false,
    priorityRelay: false,
  },
  pro: {
    label: "Pro",
    maxFileSize: "Unlimited",
    sessionDuration: "8 hours",
    maxDevices: "6 devices",
    maxConcurrentSenders: "5 senders",
    receiveLink: true,
    priorityRelay: true,
  },
};

// ── Mock data ────────────────────────────────────────────────────────────────

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

// Flip `plan` to "account" or "free" to preview the upgrade / gated states.
export const MOCK_ACCOUNT: AccountUser = {
  id: "usr_001",
  name: "Tiago Mouta",
  email: "tiagomouta609@gmail.com",
  handle: "tiago",
  defaultDeviceName: "Tiago's laptop",
  plan: "pro",
  provider: "google",
  createdAt: daysAgo(48),
};

export const MOCK_RECEIVE_SETTINGS: ReceiveSettings = {
  receiveMode: true,
  online: true,
  requireSenderName: true,
  allowSenderMessage: true,
  requireSenderMessage: false,
};

export const MOCK_RECEIVE_REQUESTS: ReceiveRequest[] = [
  {
    id: "req_1",
    senderName: "Studio Vere",
    message: "Final selects from the Tuesday shoot.",
    fileCount: 18,
    totalSize: 742 * 1024 * 1024,
    requestedAt: minutesAgo(2),
  },
  {
    id: "req_2",
    senderName: "Marco",
    fileCount: 3,
    totalSize: 54 * 1024 * 1024,
    requestedAt: minutesAgo(11),
  },
];

export const MOCK_RECEIVE_SESSIONS_LIVE: ReceiveSessionLive[] = [
  {
    id: "rsl_1",
    senderName: "Lena (client)",
    fileCount: 6,
    totalSize: 318 * 1024 * 1024,
    startedAt: minutesAgo(4),
  },
];

export const MOCK_SESSIONS: HandoffSession[] = [
  {
    id: "ses_a",
    code: "7F2K9",
    type: "standard",
    tier: "pro",
    status: "transferring",
    fileCount: 4,
    totalSize: 1.2 * 1024 * 1024 * 1024,
    connectionType: "direct",
    peerLabel: "Tiago's phone",
    createdAt: minutesAgo(1),
  },
  {
    id: "ses_b",
    code: "QX84M",
    type: "receive",
    tier: "pro",
    status: "connected",
    fileCount: 6,
    totalSize: 318 * 1024 * 1024,
    connectionType: "relay",
    peerLabel: "Lena (client)",
    createdAt: minutesAgo(4),
  },
  {
    id: "ses_c",
    code: "M3R7T",
    type: "standard",
    tier: "pro",
    status: "ended",
    fileCount: 12,
    totalSize: 486 * 1024 * 1024,
    durationMs: 6 * 60_000 + 12_000,
    success: true,
    connectionType: "direct",
    peerLabel: "Office iMac",
    createdAt: hoursAgo(3),
  },
  {
    id: "ses_d",
    code: "K9P2L",
    type: "receive",
    tier: "pro",
    status: "ended",
    fileCount: 24,
    totalSize: 1.7 * 1024 * 1024 * 1024,
    durationMs: 22 * 60_000,
    success: true,
    connectionType: "relay",
    peerLabel: "Studio Vere",
    createdAt: daysAgo(1),
  },
  {
    id: "ses_e",
    code: "B4N8W",
    type: "standard",
    tier: "free",
    status: "failed",
    fileCount: 2,
    totalSize: 920 * 1024 * 1024,
    durationMs: 48_000,
    success: false,
    connectionType: "relay",
    peerLabel: "Unknown device",
    createdAt: daysAgo(2),
  },
  {
    id: "ses_f",
    code: "Z7Q1V",
    type: "standard",
    tier: "pro",
    status: "expired",
    fileCount: 0,
    totalSize: 0,
    peerLabel: "—",
    createdAt: daysAgo(5),
  },
];

// ── Formatters ─────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatDuration(ms?: number): string {
  if (ms === undefined || ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function receiveLinkFor(handle: string): string {
  return `handitoff.io/to/${handle}`;
}

export function normalizeHandleInput(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidHandle(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(normalizeHandleInput(value));
}

// ── Backend API ─────────────────────────────────────────────────────────────

import { loadPublicRuntimeConfig } from "./runtime-config";

export type AccountData = {
  user: AccountUser;
  receive: ReceiveSettings;
  requests: ReceiveRequest[];
  liveReceive: ReceiveSessionLive[];
  sessions: HandoffSession[];
};

export async function getAccountData(options: { signal?: AbortSignal } = {}): Promise<AccountData> {
  return accountRequest<AccountData>("/api/auth/me", { signal: options.signal });
}

export async function updateAccountProfile(
  input: { name?: string; handle?: string | null; defaultDeviceName?: string | null },
  options: { signal?: AbortSignal } = {},
): Promise<AccountData> {
  return accountRequest<AccountData>("/api/account", {
    method: "PATCH",
    signal: options.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateReceiveSettings(
  input: Partial<ReceiveSettings>,
  options: { signal?: AbortSignal } = {},
): Promise<AccountData> {
  const { online: _online, ...persisted } = input;
  return accountRequest<AccountData>("/api/account/receive", {
    method: "PATCH",
    signal: options.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(persisted),
  });
}

export function googleSignInUrl(): string {
  return `${accountApiOrigin()}/api/auth/google/start`;
}

export async function signOut(): Promise<void> {
  await accountRequest<{ ok: true }>("/api/auth/sign-out", { method: "POST" });
}

async function accountRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${accountApiOrigin()}${path}`, {
    ...init,
    credentials: "include",
  });
  const body = (await response.json().catch(() => undefined)) as unknown;

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: { message?: unknown } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : "Account request failed.";
    throw new Error(message);
  }

  return body as T;
}

function accountApiOrigin(): string {
  return loadPublicRuntimeConfig().apiUrl.replace(/\/$/, "");
}
