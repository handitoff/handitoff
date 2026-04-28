import { describe, expect, it, vi } from "vitest";

import { ApiClientError, HanditoffApiClient } from "./api-client";

describe("HanditoffApiClient", () => {
  it("reads public config", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          appUrl: "http://localhost:5173",
          apiUrl: "http://localhost:8787",
          wsUrl: "ws://localhost:8787/ws",
          billing: { enabled: false },
          limits: { unpairedSessionTtlSeconds: 600, pairedSessionTtlSeconds: 1800 },
          features: { turnEnabled: false, multiDeviceRooms: false, accounts: false },
        }),
      ),
    );
    const client = new HanditoffApiClient({ baseUrl: "http://localhost:8787", fetch });

    await expect(client.getConfig()).resolves.toMatchObject({ apiUrl: "http://localhost:8787" });
    expect(fetch).toHaveBeenCalledWith("http://localhost:8787/api/config", { signal: undefined });
  });

  it("normalizes API errors", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "session_not_found", message: "Missing." } }), {
        status: 404,
      }),
    );
    const client = new HanditoffApiClient({ baseUrl: "http://localhost:8787", fetch });

    await expect(client.getSession("ABC234")).rejects.toMatchObject({
      code: "session_not_found",
      status: 404,
      message: "Missing.",
    } satisfies Partial<ApiClientError>);
  });

  it("passes abort signals to calls", async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ publicCode: "ABC234", status: "waiting", expiresAt: 1 })),
    );
    const client = new HanditoffApiClient({ baseUrl: "http://localhost:8787/", fetch });

    await client.getSession("ABC234", { signal: controller.signal });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });
});
