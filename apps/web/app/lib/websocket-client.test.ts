import { describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "@handitoff/protocol";

import { HanditoffWebSocketClient, type WebSocketLike } from "./websocket-client";

describe("HanditoffWebSocketClient", () => {
  it("parses valid server messages and ignores invalid ones", () => {
    const socket = new FakeWebSocket();
    const client = new HanditoffWebSocketClient("ws://localhost/ws", () => socket);
    const listener = vi.fn();
    client.onMessage(listener);
    client.connect();

    socket.emitMessage(JSON.stringify({ type: "session:ended" }));
    socket.emitMessage(JSON.stringify({ type: "unknown" }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ type: "session:ended" });
  });

  it("validates client messages before sending", () => {
    const socket = new FakeWebSocket();
    const client = new HanditoffWebSocketClient("ws://localhost/ws", () => socket);
    client.connect();
    socket.open();

    client.send({ type: "presence:ping", sessionId: "session-1", deviceId: "device-1" });
    expect(socket.sent).toEqual([
      JSON.stringify({ type: "presence:ping", sessionId: "session-1", deviceId: "device-1" }),
    ]);

    expect(() => client.send({ type: "session:create" } as ClientMessage)).toThrow(
      "deviceId is required.",
    );
  });

  it("surfaces disconnected state on close", () => {
    const socket = new FakeWebSocket();
    const client = new HanditoffWebSocketClient("ws://localhost/ws", () => socket);
    const statuses: string[] = [];
    client.onStatus((status) => statuses.push(status));
    client.connect();
    socket.open();
    socket.close();

    expect(statuses).toEqual(["connected", "disconnected"]);
  });
});

class FakeWebSocket implements WebSocketLike {
  public readyState = 0;
  public sent: string[] = [];
  private readonly listeners = new Map<string, Set<(event?: { data: unknown }) => void>>();

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(): void {
    this.readyState = 3;
    this.emit("close");
  }

  public addEventListener(type: "open", listener: () => void): void;
  public addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  public addEventListener(type: "close", listener: () => void): void;
  public addEventListener(type: "error", listener: () => void): void;
  public addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: (() => void) | ((event: { data: unknown }) => void),
  ): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener as (event?: { data: unknown }) => void);
    this.listeners.set(type, listeners);
  }

  public open(): void {
    this.readyState = 1;
    this.emit("open");
  }

  public emitMessage(data: string): void {
    this.emit("message", { data });
  }

  private emit(type: string, event?: { data: unknown }): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}
