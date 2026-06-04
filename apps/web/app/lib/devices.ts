// ─────────────────────────────────────────────────────────────────────────────
// Signed-in devices data layer.
//
// Live presence and handoffs run over the signaling websocket (see
// components/account/devices-context). This module is the REST seam for the
// things that aren't presence: the initial device list, renames, and removals.
// Types mirror the protocol's AccountDevicePresence so the websocket and REST
// paths produce the same shape.
// ─────────────────────────────────────────────────────────────────────────────

import type { AccountDevicePresence } from "@handitoff/protocol";
import { inferBrowser, inferOs } from "./analytics";
import { getPersistentDeviceId, inferDeviceLabel, inferDeviceType } from "./device";
import { loadPublicRuntimeConfig } from "./runtime-config";

export type AccountDevice = AccountDevicePresence;

/** Everything we send to the backend when registering this browser as a device. */
export type DeviceRegistration = {
  deviceId: string;
  label: string;
  browser: string;
  os: string;
  deviceType: string;
};

/**
 * The identity + metadata used to register this browser. `label` is the user's
 * saved default device name when available, otherwise an inferred fallback.
 */
export function getDeviceRegistration(defaultLabel?: string): DeviceRegistration {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const label =
    defaultLabel !== undefined && defaultLabel.trim() !== ""
      ? defaultLabel.trim()
      : inferDeviceLabel(userAgent);
  return {
    deviceId: getPersistentDeviceId(),
    label,
    browser: inferBrowser(userAgent),
    os: inferOs(userAgent),
    deviceType: inferDeviceType(userAgent),
  };
}

/** A short "Chrome · Windows" style descriptor for a device row. */
export function devicePlatformLabel(device: Pick<AccountDevice, "browser" | "os">): string {
  return [device.browser, device.os]
    .filter((part) => part !== undefined && part !== "")
    .join(" · ");
}

export async function listDevices(
  currentDeviceId: string,
  options: { signal?: AbortSignal } = {},
): Promise<AccountDevice[]> {
  const query = new URLSearchParams({ currentDeviceId }).toString();
  const data = await deviceRequest<{ devices: AccountDevice[] }>(`/api/account/devices?${query}`, {
    signal: options.signal,
  });
  return data.devices;
}

export async function registerDevice(
  registration: DeviceRegistration,
  options: { signal?: AbortSignal } = {},
): Promise<AccountDevice> {
  const data = await deviceRequest<{ device: AccountDevice }>("/api/account/devices", {
    method: "POST",
    signal: options.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(registration),
  });
  return data.device;
}

export async function renameDevice(
  deviceId: string,
  label: string,
  options: { signal?: AbortSignal } = {},
): Promise<AccountDevice> {
  const data = await deviceRequest<{ device: AccountDevice }>(
    `/api/account/devices/${encodeURIComponent(deviceId)}`,
    {
      method: "PATCH",
      signal: options.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label }),
    },
  );
  return data.device;
}

export async function removeDevice(
  deviceId: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  await deviceRequest<{ ok: true }>(`/api/account/devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
    signal: options.signal,
  });
}

async function deviceRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${deviceApiOrigin()}${path}`, { ...init, credentials: "include" });
  const body = (await response.json().catch(() => undefined)) as unknown;

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: { message?: unknown } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : "Device request failed.";
    throw new Error(message);
  }

  return body as T;
}

function deviceApiOrigin(): string {
  return loadPublicRuntimeConfig().apiUrl.replace(/\/$/, "");
}
