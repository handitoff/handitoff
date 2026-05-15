import {
  validateClientMessage,
  validateServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "@handitoff/protocol";

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
    const validation = validateClientMessage(message);
    if (!validation.ok) {
      throw new Error(validation.error.message);
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

    const validation = validateServerMessage(parsed);
    if (!validation.ok) {
      return;
    }

    for (const listener of this.listeners) {
      listener(validation.value);
    }
  }

  private emitStatus(state: "connected" | "disconnected", reason?: string): void {
    for (const listener of this.statusListeners) {
      listener(state, reason);
    }
  }
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
