import { describe, expect, it } from "vitest";
import type { ServerConfig } from "@handitoff/config";
import type { ClientMessage, ServerMessage } from "@handitoff/protocol";

import { FixedWindowRateLimiter } from "./rate-limits.js";
import { SignalingHub, type SignalingSocket } from "./signaling.js";
import { InMemorySessionStore } from "./session-store.js";

const config: ServerConfig = {
  publicConfig: {
    appUrl: "http://localhost:5173",
    apiUrl: "http://localhost:8787",
    wsUrl: "ws://localhost:8787/ws",
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    billing: { enabled: false },
    analytics: { enabled: true },
    limits: {
      unpairedSessionTtlSeconds: 60,
      pairedSessionTtlSeconds: 120,
      maxFilesPerTransfer: 100,
      maxFileSizeBytes: 1024,
      maxRecommendedFileSizeBytes: 1024,
      maxTotalTransferSizeBytes: 2048,
    },
    features: {
      turnEnabled: false,
      multiDeviceRooms: false,
      accounts: false,
    },
  },
  rateLimits: {
    maxActiveSessionsPerIp: 5,
    maxJoinAttemptsPerPublicCode: 2,
    maxSignalingMessagesPerMinutePerSession: 300,
  },
};

describe("signaling hub", () => {
  it("handles connect, invalid JSON, invalid protocol messages, and disconnect cleanup", async () => {
    const { hub } = createHarness();
    const socket = new FakeSocket("socket-1");
    hub.addSocket(socket);

    socket.receive("{");
    await flush();
    expect(last(socket)).toMatchObject({ type: "error", code: "invalid_message" });

    socket.receiveJson({ type: "unknown" });
    await flush();
    expect(last(socket)).toMatchObject({ type: "error", code: "invalid_message" });

    socket.receiveJson({ type: "session:create", deviceId: "host-1" });
    await flush();
    expect(last(socket)).toMatchObject({ type: "session:created" });

    socket.close();
    const reconnect = new FakeSocket("socket-2");
    hub.addSocket(reconnect);
    reconnect.receiveJson({ type: "session:create", deviceId: "host-1" });
    await flush();
    expect(last(reconnect)).toMatchObject({ type: "session:created" });
  });

  it("creates sessions over WebSocket and rejects duplicate active device IDs", async () => {
    const { hub } = createHarness();
    const host = new FakeSocket("host");
    const duplicate = new FakeSocket("duplicate");
    hub.addSocket(host);
    hub.addSocket(duplicate);

    host.receiveJson({ type: "session:create", deviceId: "host-1", deviceLabel: "Laptop" });
    await flush();
    expect(last(host)).toMatchObject({
      type: "session:created",
      sessionId: "session-1",
      publicCode: "ABC234",
      joinUrl: "http://localhost:5173/join/ABC234",
    });

    duplicate.receiveJson({ type: "session:create", deviceId: "host-1" });
    await flush();
    expect(last(duplicate)).toMatchObject({ type: "error", code: "invalid_device_id" });
  });

  it("sends join requests without immediately pairing the guest", async () => {
    const { hub, store } = createHarness();
    const { host, guest } = await createHostAndGuest(hub);

    expect(last(host)).toMatchObject({
      type: "session:join-request",
      sessionId: "session-1",
      peerDeviceId: "guest-1",
      peerDeviceLabel: "Phone",
    });
    expect(guest.sent).toHaveLength(0);

    const session = await store.getById("session-1");
    expect(session?.status).toBe("pairing");
    expect(session?.guestDeviceId).toBeUndefined();
  });

  it("rejects expired, full, and repeated join attempts", async () => {
    let now = 1_000;
    const { hub } = createHarness({ now: () => now, codes: ["ABC234", "DEF345"] });
    const host = new FakeSocket("host");
    const guest = new FakeSocket("guest");
    const secondGuest = new FakeSocket("guest-2");
    hub.addSocket(host);
    hub.addSocket(guest);
    hub.addSocket(secondGuest);

    host.receiveJson({ type: "session:create", deviceId: "host-1" });
    await flush();
    now += 61_000;
    guest.receiveJson({ type: "session:join", publicCode: "ABC234", deviceId: "guest-1" });
    await flush();
    expect(last(guest)).toMatchObject({ type: "error", code: "session_expired" });

    const host2 = new FakeSocket("host-2-socket");
    hub.addSocket(host2);
    host2.receiveJson({ type: "session:create", deviceId: "host-2" });
    await flush();

    guest.receiveJson({ type: "session:join", publicCode: "DEF345", deviceId: "guest-1" });
    await flush();
    secondGuest.receiveJson({ type: "session:join", publicCode: "DEF345", deviceId: "guest-2" });
    await flush();
    expect(last(secondGuest)).toMatchObject({ type: "error", code: "session_full" });

    const repeated = new FakeSocket("repeated");
    hub.addSocket(repeated);
    repeated.receiveJson({ type: "session:join", publicCode: "ZZZ999", deviceId: "guest-3" });
    await flush();
    repeated.receiveJson({ type: "session:join", publicCode: "ZZZ999", deviceId: "guest-3" });
    await flush();
    repeated.receiveJson({ type: "session:join", publicCode: "ZZZ999", deviceId: "guest-3" });
    await flush();
    expect(last(repeated)).toMatchObject({ type: "error", code: "rate_limited" });
  });

  it("supports host approval and rejection", async () => {
    const { hub } = createHarness({ codes: ["ABC234", "DEF345"] });
    const first = await createHostAndGuest(hub);

    first.host.receiveJson({
      type: "session:approve-peer",
      sessionId: "session-1",
      deviceId: "host-1",
      peerDeviceId: "guest-1",
    });
    await flush();
    expect(last(first.guest)).toMatchObject({
      type: "session:joined",
      sessionId: "session-1",
      peerDeviceId: "host-1",
    });
    expect(last(first.host)).toMatchObject({ type: "peer:connected", peerDeviceId: "guest-1" });

    const second = await createHostAndGuest(hub, {
      hostId: "host-2",
      guestId: "guest-2",
      hostSocketId: "host-2-socket",
      guestSocketId: "guest-2-socket",
      publicCode: "DEF345",
    });
    second.guest.receiveJson({
      type: "session:approve-peer",
      sessionId: "session-2",
      deviceId: "guest-2",
      peerDeviceId: "host-2",
    });
    await flush();
    expect(last(second.guest)).toMatchObject({ type: "error", code: "not_authorized" });

    second.host.receiveJson({
      type: "session:approve-peer",
      sessionId: "session-2",
      deviceId: "host-2",
      peerDeviceId: "stale",
    });
    await flush();
    expect(last(second.host)).toMatchObject({ type: "error", code: "peer_disconnected" });

    second.host.receiveJson({
      type: "session:reject-peer",
      sessionId: "session-2",
      deviceId: "host-2",
      peerDeviceId: "guest-2",
    });
    await flush();
    expect(last(second.guest)).toMatchObject({
      type: "session:rejected",
      reason: "rejected_by_host",
    });
  });

  it("blocks signaling before approval and relays WebRTC messages only to the approved peer", async () => {
    const { hub } = createHarness();
    const { host, guest } = await createHostAndGuest(hub);

    guest.receiveJson({
      type: "webrtc:offer",
      sessionId: "session-1",
      fromDeviceId: "guest-1",
      sdp: { type: "offer", sdp: "pending" },
    });
    await flush();
    expect(last(guest)).toMatchObject({ type: "error", code: "peer_not_approved" });

    host.receiveJson({
      type: "session:approve-peer",
      sessionId: "session-1",
      deviceId: "host-1",
      peerDeviceId: "guest-1",
    });
    await flush();

    guest.receiveJson({
      type: "webrtc:offer",
      sessionId: "session-1",
      fromDeviceId: "guest-1",
      sdp: { type: "offer", sdp: "approved" },
    });
    await flush();
    expect(last(host)).toEqual({
      type: "webrtc:offer",
      fromDeviceId: "guest-1",
      sdp: { type: "offer", sdp: "approved" },
    });

    host.receiveJson({
      type: "webrtc:answer",
      sessionId: "session-1",
      fromDeviceId: "host-1",
      sdp: { type: "answer", sdp: "answer" },
    });
    await flush();
    expect(last(guest)).toEqual({
      type: "webrtc:answer",
      fromDeviceId: "host-1",
      sdp: { type: "answer", sdp: "answer" },
    });

    guest.receiveJson({
      type: "webrtc:ice-candidate",
      sessionId: "session-1",
      fromDeviceId: "guest-1",
      candidate: { candidate: "candidate" },
    });
    await flush();
    expect(last(host)).toEqual({
      type: "webrtc:ice-candidate",
      fromDeviceId: "guest-1",
      candidate: { candidate: "candidate" },
    });

    host.receiveJson({
      type: "crypto:public-key",
      sessionId: "session-1",
      fromDeviceId: "host-1",
      publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
    });
    await flush();
    expect(last(guest)).toEqual({
      type: "crypto:public-key",
      fromDeviceId: "host-1",
      publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
    });

    guest.receiveJson({
      type: "crypto:public-key",
      sessionId: "session-1",
      fromDeviceId: "guest-1",
      publicKey: { kty: "EC", crv: "P-384", x: "x", y: "y" },
    });
    await flush();
    expect(last(guest)).toMatchObject({ type: "error", code: "crypto_failed" });

    const stranger = new FakeSocket("stranger");
    hub.addSocket(stranger);
    stranger.receiveJson({ type: "session:create", deviceId: "stranger" });
    await flush();
    stranger.receiveJson({
      type: "webrtc:offer",
      sessionId: "session-1",
      fromDeviceId: "stranger",
      sdp: { type: "offer", sdp: "wrong-session" },
    });
    await flush();
    expect(last(stranger)).toMatchObject({ type: "error", code: "not_authorized" });
  });

  it("resumes approved sessions and announces peer presence", async () => {
    const { hub } = createHarness();
    const { host, guest } = await createApprovedPair(hub);
    host.close();
    guest.close();
    await flush();

    const resumedHost = new FakeSocket("resumed-host");
    const resumedGuest = new FakeSocket("resumed-guest");
    hub.addSocket(resumedHost);
    hub.addSocket(resumedGuest);

    resumedHost.receiveJson({ type: "session:resume", sessionId: "session-1", deviceId: "host-1" });
    await flush();
    expect(last(resumedHost)).toMatchObject({
      type: "session:resumed",
      peerDeviceId: "guest-1",
      role: "host",
    });

    resumedGuest.receiveJson({
      type: "session:resume",
      sessionId: "session-1",
      deviceId: "guest-1",
    });
    await flush();
    expect(resumedGuest.sent).toContainEqual(
      expect.objectContaining({
        type: "session:resumed",
        peerDeviceId: "host-1",
        role: "guest",
      }),
    );
    expect(resumedHost.sent).toContainEqual({ type: "peer:connected", peerDeviceId: "guest-1" });
    expect(resumedGuest.sent).toContainEqual({ type: "peer:connected", peerDeviceId: "host-1" });
  });

  it("detects close and heartbeat timeouts", async () => {
    let now = 1_000;
    const { hub } = createHarness({ now: () => now, heartbeatTimeoutMs: 50 });
    const { host, guest } = await createApprovedPair(hub);

    guest.close();
    await flush();
    expect(last(host)).toEqual({ type: "peer:disconnected", peerDeviceId: "guest-1" });

    const second = await createApprovedPair(hub, {
      hostId: "host-2",
      guestId: "guest-2",
      hostSocketId: "host-2-socket",
      guestSocketId: "guest-2-socket",
      publicCode: "DEF345",
    });
    now += 51;
    hub.sweepHeartbeats(now);
    expect(second.host.closed).toBe(true);
    expect(last(second.guest)).toEqual({ type: "peer:disconnected", peerDeviceId: "host-2" });
  });

  it("supports session:end from either paired device and blocks further signaling", async () => {
    const { hub, store } = createHarness();
    const { host, guest } = await createApprovedPair(hub);

    guest.receiveJson({ type: "session:end", sessionId: "session-1", deviceId: "guest-1" });
    await flush();
    expect(last(host)).toEqual({ type: "session:ended" });
    expect(last(guest)).toEqual({ type: "session:ended" });
    await expect(store.getById("session-1", { includeExpired: true })).resolves.toMatchObject({
      status: "ended",
    });

    guest.receiveJson({
      type: "webrtc:offer",
      sessionId: "session-1",
      fromDeviceId: "guest-1",
      sdp: { type: "offer", sdp: "after-end" },
    });
    await flush();
    expect(last(guest)).toMatchObject({ type: "error", code: "session_ended" });
  });

  it("rate limits WebRTC relay messages per session", async () => {
    const { hub } = createHarness({
      rateLimits: {
        maxActiveSessionsPerIp: 50,
        maxJoinAttemptsPerPublicCode: 2,
        maxSignalingMessagesPerMinutePerSession: 1,
      },
    });
    const { guest } = await createApprovedPair(hub);

    guest.receiveJson({
      type: "webrtc:offer",
      sessionId: "session-1",
      fromDeviceId: "guest-1",
      sdp: { type: "offer", sdp: "one" },
    });
    await flush();
    guest.receiveJson({
      type: "webrtc:ice-candidate",
      sessionId: "session-1",
      fromDeviceId: "guest-1",
      candidate: { candidate: "two" },
    });
    await flush();

    expect(last(guest)).toMatchObject({ type: "error", code: "rate_limited" });
  });
});

function createHarness(
  options: {
    now?: () => number;
    codes?: string[];
    heartbeatTimeoutMs?: number;
    rateLimits?: ServerConfig["rateLimits"];
  } = {},
) {
  let id = 0;
  const codes = [...(options.codes ?? ["ABC234", "DEF345", "GHJ456"])];
  const store = new InMemorySessionStore({
    codeGenerator: () => codes.shift() ?? "ZZZ999",
    idGenerator: () => `session-${++id}`,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const hub = new SignalingHub({
    config:
      options.rateLimits === undefined ? config : { ...config, rateLimits: options.rateLimits },
    store,
    rateLimiter: new FixedWindowRateLimiter(options.now === undefined ? {} : { now: options.now }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.heartbeatTimeoutMs === undefined
      ? {}
      : { heartbeatTimeoutMs: options.heartbeatTimeoutMs }),
  });
  return { hub, store };
}

async function createHostAndGuest(
  hub: SignalingHub,
  options: {
    hostId?: string;
    guestId?: string;
    hostSocketId?: string;
    guestSocketId?: string;
    publicCode?: string;
  } = {},
) {
  const host = new FakeSocket(options.hostSocketId ?? "host");
  const guest = new FakeSocket(options.guestSocketId ?? "guest");
  const hostId = options.hostId ?? "host-1";
  const guestId = options.guestId ?? "guest-1";
  hub.addSocket(host);
  hub.addSocket(guest);
  host.receiveJson({ type: "session:create", deviceId: hostId, deviceLabel: "Laptop" });
  await flush();
  guest.receiveJson({
    type: "session:join",
    publicCode: options.publicCode ?? "ABC234",
    deviceId: guestId,
    deviceLabel: "Phone",
  });
  await flush();
  return { host, guest };
}

async function createApprovedPair(
  hub: SignalingHub,
  options: {
    hostId?: string;
    guestId?: string;
    hostSocketId?: string;
    guestSocketId?: string;
    publicCode?: string;
  } = {},
) {
  const pair = await createHostAndGuest(hub, options);
  pair.host.receiveJson({
    type: "session:approve-peer",
    sessionId: options.hostId === "host-2" ? "session-2" : "session-1",
    deviceId: options.hostId ?? "host-1",
    peerDeviceId: options.guestId ?? "guest-1",
  });
  await flush();
  return pair;
}

function last(socket: FakeSocket): ServerMessage | undefined {
  return socket.sent.at(-1);
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeSocket implements SignalingSocket {
  public readonly sent: ServerMessage[] = [];
  public closed = false;
  private messageHandler: ((raw: string) => void) | undefined;
  private closeHandler: (() => void) | undefined;

  public constructor(public readonly id: string) {}

  public send(message: ServerMessage): void {
    this.sent.push(message);
  }

  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.closeHandler?.();
  }

  public onMessage(handler: (raw: string) => void): void {
    this.messageHandler = handler;
  }

  public onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  public receive(raw: string): void {
    this.messageHandler?.(raw);
  }

  public receiveJson(message: ClientMessage | Record<string, unknown>): void {
    this.receive(JSON.stringify(message));
  }
}
