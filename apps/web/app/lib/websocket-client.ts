import type { ClientMessage, ServerMessage } from "@handitoff/protocol";

export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(
    type: "close",
    listener: (event: { code?: number; reason?: string }) => void,
  ): void;
  addEventListener(type: "error", listener: () => void): void;
};

export type WebSocketFactory = (url: string) => WebSocketLike;

export class HanditoffWebSocketClient {
  private socket: WebSocketLike | undefined;
  private readonly listeners = new Set<(message: ServerMessage) => void>();
  private readonly statusListeners = new Set<
    (state: "connected" | "disconnected", reason?: string) => void
  >();

  public constructor(
    private readonly url: string,
    private readonly createSocket: WebSocketFactory = (socketUrl) => new WebSocket(socketUrl),
  ) {}

  public connect(): void {
    if (this.socket !== undefined) {
      return;
    }

    let socket: WebSocketLike;
    try {
      socket = this.createSocket(this.url);
    } catch (error) {
      this.emitStatus(
        "disconnected",
        error instanceof Error ? error.message : "Could not open WebSocket connection.",
      );
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => this.emitStatus("connected"));
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    socket.addEventListener("close", (event) => {
      this.socket = undefined;
      this.emitStatus("disconnected", formatCloseReason(event));
    });
    socket.addEventListener("error", () => {
      this.emitStatus("disconnected", `Could not connect to signaling server at ${this.url}.`);
    });
  }

  public send(message: ClientMessage): void {
    const error = getClientMessageError(message);
    if (error !== undefined) {
      throw new Error(error);
    }
    if (this.socket === undefined || this.socket.readyState !== 1) {
      throw new Error("WebSocket is disconnected.");
    }
    this.socket.send(JSON.stringify(message));
  }

  public close(): void {
    this.socket?.close();
    this.socket = undefined;
    this.emitStatus("disconnected");
  }

  public onMessage(listener: (message: ServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public onStatus(
    listener: (state: "connected" | "disconnected", reason?: string) => void,
  ): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (!isServerMessage(parsed)) {
      return;
    }

    for (const listener of this.listeners) {
      listener(parsed);
    }
  }

  private emitStatus(state: "connected" | "disconnected", reason?: string): void {
    for (const listener of this.statusListeners) {
      listener(state, reason);
    }
  }
}

function getClientMessageError(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.type !== "string") {
    return "type is required.";
  }

  switch (value.type) {
    case "device:register":
    case "device:heartbeat":
      return requireString(value, "deviceId");
    case "account-handoff:start":
      return requireStrings(value, ["deviceId", "targetDeviceId"]);
    case "account-handoff:accept":
    case "account-handoff:reject":
      return requireStrings(value, ["requestId", "deviceId"]);
    case "session:create":
      return requireString(value, "deviceId");
    case "session:join":
      return requireStrings(value, ["publicCode", "deviceId"]);
    case "session:resume":
    case "session:end":
    case "presence:ping":
      return requireStrings(value, ["sessionId", "deviceId"]);
    case "session:approve-peer":
    case "session:reject-peer":
      return requireStrings(value, ["sessionId", "deviceId", "peerDeviceId"]);
    case "webrtc:offer":
    case "webrtc:answer":
      return requireStrings(value, ["sessionId", "fromDeviceId"]) ?? requireObject(value, "sdp");
    case "webrtc:ice-candidate":
      return (
        requireStrings(value, ["sessionId", "fromDeviceId"]) ?? requireObject(value, "candidate")
      );
    case "crypto:public-key":
      return (
        requireStrings(value, ["sessionId", "fromDeviceId"]) ?? requireObject(value, "publicKey")
      );
    default:
      return "Unknown message type.";
  }
}

function isServerMessage(value: unknown): value is ServerMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "device:list":
      return Array.isArray(value.devices);
    case "account-handoff:request":
      return (
        requireStrings(value, [
          "requestId",
          "sessionId",
          "fromDeviceId",
          "fromDeviceLabel",
          "targetDeviceId",
        ]) === undefined
      );
    case "account-handoff:started":
      return (
        requireStrings(value, [
          "requestId",
          "sessionId",
          "targetDeviceId",
          "publicCode",
          "joinUrl",
        ]) === undefined && typeof value.expiresAt === "number"
      );
    case "account-handoff:rejected":
      return requireStrings(value, ["requestId", "reason"]) === undefined;
    case "session:created":
      return (
        requireStrings(value, ["sessionId", "publicCode", "joinUrl"]) === undefined &&
        typeof value.expiresAt === "number"
      );
    case "session:join-request":
    case "session:joined":
      return requireStrings(value, ["sessionId", "peerDeviceId", "peerDeviceLabel"]) === undefined;
    case "session:resumed":
      return (
        requireStrings(value, ["sessionId", "peerDeviceId", "peerDeviceLabel", "role"]) ===
          undefined &&
        (value.role === "host" || value.role === "guest")
      );
    case "session:rejected":
      return requireString(value, "reason") === undefined;
    case "peer:connected":
    case "peer:disconnected":
      return requireString(value, "peerDeviceId") === undefined;
    case "webrtc:offer":
    case "webrtc:answer":
      return requireString(value, "fromDeviceId") === undefined && isRecord(value.sdp);
    case "webrtc:ice-candidate":
      return requireString(value, "fromDeviceId") === undefined && isRecord(value.candidate);
    case "crypto:public-key":
      return requireString(value, "fromDeviceId") === undefined && isRecord(value.publicKey);
    case "session:expired":
    case "session:ended":
      return true;
    case "error":
      return requireStrings(value, ["code", "message"]) === undefined;
    default:
      return false;
  }
}

function requireStrings(value: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const error = requireString(value, field);
    if (error !== undefined) {
      return error;
    }
  }
  return undefined;
}

function requireString(value: Record<string, unknown>, field: string): string | undefined {
  return typeof value[field] === "string" && value[field].trim() !== ""
    ? undefined
    : `${field} is required.`;
}

function requireObject(value: Record<string, unknown>, field: string): string | undefined {
  return isRecord(value[field]) ? undefined : `${field} is required.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatCloseReason(
  event: { code?: number; reason?: string } | undefined,
): string | undefined {
  if (event === undefined) {
    return undefined;
  }
  if (event.reason !== undefined && event.reason.trim() !== "") {
    return event.reason;
  }
  if (event.code !== undefined && event.code !== 1000) {
    return `Signaling server disconnected WebSocket with code ${event.code}.`;
  }
  return undefined;
}
