import { normalizeProtocolError, type PublicConfig, type PublicSession } from "@handitoff/protocol";

export type ApiClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
};

export type CreatedSession = PublicSession & {
  joinUrl: string;
};

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;

  public constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export class HanditoffApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  public getConfig(options: { signal?: AbortSignal } = {}): Promise<PublicConfig> {
    return this.request<PublicConfig>("/api/config", { signal: options.signal });
  }

  public createSession(
    input: { hostDeviceId: string; hostLabel?: string },
    options: { signal?: AbortSignal } = {},
  ): Promise<CreatedSession> {
    return this.request<CreatedSession>("/api/sessions", {
      method: "POST",
      signal: options.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  public getSession(publicCode: string, options: { signal?: AbortSignal } = {}): Promise<PublicSession> {
    return this.request<PublicSession>(`/api/sessions/${encodeURIComponent(publicCode)}`, {
      signal: options.signal,
    });
  }

  public endSession(
    sessionId: string,
    input: { deviceId: string; reason?: string },
    options: { signal?: AbortSignal } = {},
  ): Promise<PublicSession> {
    return this.request<PublicSession>(`/api/sessions/${encodeURIComponent(sessionId)}/end`, {
      method: "POST",
      signal: options.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    const body = (await response.json().catch(() => undefined)) as unknown;

    if (!response.ok) {
      const candidate =
        typeof body === "object" && body !== null && "error" in body ? (body as { error: unknown }).error : body;
      const error = normalizeProtocolError(candidate);
      throw new ApiClientError(error.code, error.message, response.status);
    }

    return body as T;
  }
}

