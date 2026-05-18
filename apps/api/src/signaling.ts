import type { ServerConfig } from "@handitoff/config";
import {
  validateClientMessage,
  type ClientMessage,
  type ProtocolErrorCode,
  type ServerMessage,
} from "@handitoff/protocol";

import { FixedWindowRateLimiter } from "./rate-limits.js";
import type { SessionStore, StoredSession } from "./session-store.js";

export type SignalingSocket = {
  readonly id: string;
  send(message: ServerMessage): void;
  close(code?: number, reason?: string): void;
  onMessage(handler: (raw: string) => void): void;
  onClose(handler: () => void): void;
};

export type SignalingHubOptions = {
  config: ServerConfig;
  store: SessionStore;
  rateLimiter?: FixedWindowRateLimiter;
  now?: () => number;
  heartbeatTimeoutMs?: number;
};

type ConnectionState = {
  socket: SignalingSocket;
  deviceId?: string;
  deviceLabel?: string;
  sessionId?: string;
  role?: "host" | "guest";
  approved: boolean;
  lastSeenAt: number;
};

type PendingJoin = {
  sessionId: string;
  publicCode: string;
  guestDeviceId: string;
  guestDeviceLabel: string;
  guestSocketId: string;
};

export class SignalingHub {
  private readonly config: ServerConfig;
  private readonly store: SessionStore;
  private readonly rateLimiter: FixedWindowRateLimiter;
  private readonly now: () => number;
  private readonly heartbeatTimeoutMs: number;
  private readonly connections = new Map<string, ConnectionState>();
  private readonly connectionIdsByDevice = new Map<string, string>();
  private readonly pendingJoinsBySession = new Map<string, PendingJoin>();

  public constructor(options: SignalingHubOptions) {
    this.config = options.config;
    this.store = options.store;
    this.rateLimiter =
      options.rateLimiter ??
      new FixedWindowRateLimiter(options.now === undefined ? {} : { now: options.now });
    this.now = options.now ?? Date.now;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 30_000;
  }

  public addSocket(socket: SignalingSocket): void {
    this.connections.set(socket.id, {
      socket,
      approved: false,
      lastSeenAt: this.now(),
    });

    socket.onMessage((raw) => void this.handleRawMessage(socket.id, raw));
    socket.onClose(() => this.removeSocket(socket.id));
  }

  public expireSession(sessionId: string): void {
    this.sendToSession(sessionId, { type: "session:expired" });
    this.clearSessionConnections(sessionId);
  }

  public sweepHeartbeats(now = this.now()): void {
    for (const connection of this.connections.values()) {
      if (
        connection.deviceId !== undefined &&
        now - connection.lastSeenAt > this.heartbeatTimeoutMs
      ) {
        connection.socket.close(4000, "heartbeat_timeout");
        this.removeSocket(connection.socket.id);
      }
    }
  }

  private async handleRawMessage(socketId: string, raw: string): Promise<void> {
    const connection = this.connections.get(socketId);
    if (connection === undefined) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendError(connection, "invalid_message", "Message must be valid JSON.");
      return;
    }

    const validation = validateClientMessage(parsed);
    if (!validation.ok) {
      this.sendError(connection, validation.error.code, validation.error.message);
      return;
    }

    await this.handleMessage(connection, validation.value);
  }

  private async handleMessage(connection: ConnectionState, message: ClientMessage): Promise<void> {
    this.sweepHeartbeats();

    switch (message.type) {
      case "session:create":
        await this.createSession(connection, message);
        return;
      case "session:join":
        await this.requestJoin(connection, message);
        return;
      case "session:resume":
        await this.resumeSession(connection, message);
        return;
      case "session:approve-peer":
        await this.approvePeer(connection, message);
        return;
      case "session:reject-peer":
        await this.rejectPeer(connection, message);
        return;
      case "presence:ping":
        await this.ping(connection, message);
        return;
      case "webrtc:offer":
      case "webrtc:answer":
      case "webrtc:ice-candidate":
      case "crypto:public-key":
        await this.relay(connection, message);
        return;
      case "session:end":
        await this.endSession(connection, message);
        return;
    }
  }

  private async createSession(
    connection: ConnectionState,
    message: Extract<ClientMessage, { type: "session:create" }>,
  ): Promise<void> {
    if (!this.claimDevice(connection, message.deviceId, message.deviceLabel, "host")) {
      return;
    }

    const activeSessions = await this.store.countActiveByIp("websocket");
    if (activeSessions >= this.config.rateLimits.maxActiveSessionsPerIp) {
      this.sendError(connection, "rate_limited", "Too many active sessions for this IP address.");
      return;
    }

    const session = await this.store.create({
      hostDeviceId: message.deviceId,
      hostLabel: readLabel(message.deviceLabel, "Host"),
      hostIpKey: "websocket",
      ttlSeconds: this.config.publicConfig.limits.unpairedSessionTtlSeconds,
    });

    connection.sessionId = session.id;
    connection.approved = true;
    connection.socket.send({
      type: "session:created",
      sessionId: session.id,
      publicCode: session.publicCode,
      joinUrl: new URL(`/join/${session.publicCode}`, this.config.publicConfig.appUrl).toString(),
      expiresAt: session.expiresAt,
    });
  }

  private async requestJoin(
    connection: ConnectionState,
    message: Extract<ClientMessage, { type: "session:join" }>,
  ): Promise<void> {
    if (!this.claimDevice(connection, message.deviceId, message.deviceLabel, "guest")) {
      return;
    }

    const limit = this.rateLimiter.hit(
      `ws:join:${message.publicCode}:${message.deviceId}`,
      this.config.rateLimits.maxJoinAttemptsPerPublicCode,
      60_000,
    );
    if (!limit.allowed) {
      this.sendError(connection, "rate_limited", "Too many join attempts for this public code.");
      return;
    }

    const session = await this.store.getByPublicCode(message.publicCode, { includeExpired: true });
    if (session === undefined) {
      this.sendError(connection, "session_not_found", "Session not found.");
      return;
    }
    if (session.status === "expired") {
      this.sendError(connection, "session_expired", "Session has expired.");
      return;
    }
    if (session.status === "ended") {
      this.sendError(connection, "session_ended", "Session has ended.");
      return;
    }
    if (
      session.status === "connected" ||
      session.guestDeviceId !== undefined ||
      this.pendingJoinsBySession.has(session.id)
    ) {
      this.sendError(
        connection,
        "session_full",
        "Session already has a pending or approved guest.",
      );
      return;
    }

    const host = this.findConnection(session.id, session.hostDeviceId);
    if (host === undefined) {
      this.sendError(connection, "peer_disconnected", "Host is not connected.");
      return;
    }

    connection.sessionId = session.id;
    this.pendingJoinsBySession.set(session.id, {
      sessionId: session.id,
      publicCode: session.publicCode,
      guestDeviceId: message.deviceId,
      guestDeviceLabel: readLabel(message.deviceLabel, "Guest"),
      guestSocketId: connection.socket.id,
    });
    await this.store.updateStatus(session.id, "pairing");

    host.socket.send({
      type: "session:join-request",
      sessionId: session.id,
      peerDeviceId: message.deviceId,
      peerDeviceLabel: readLabel(message.deviceLabel, "Guest"),
    });
  }

  private async resumeSession(
    connection: ConnectionState,
    message: Extract<ClientMessage, { type: "session:resume" }>,
  ): Promise<void> {
    const session = await this.store.getById(message.sessionId, { includeExpired: true });
    if (session === undefined) {
      this.sendError(connection, "session_not_found", "Session not found.");
      return;
    }
    if (session.status === "expired") {
      this.sendError(connection, "session_expired", "Session has expired.");
      return;
    }
    if (session.status === "ended") {
      this.sendError(connection, "session_ended", "Session has ended.");
      return;
    }
    if (session.status !== "connected" || session.guestDevice === undefined) {
      this.sendError(connection, "peer_not_approved", "Peer must be approved before signaling.");
      return;
    }

    const role =
      message.deviceId === session.hostDeviceId
        ? "host"
        : message.deviceId === session.guestDeviceId
          ? "guest"
          : undefined;
    if (role === undefined) {
      this.sendError(connection, "not_authorized", "Device is not connected to this session.");
      return;
    }

    const deviceLabel = role === "host" ? session.hostDevice.label : session.guestDevice.label;
    if (!this.claimDevice(connection, message.deviceId, deviceLabel, role)) {
      return;
    }

    connection.sessionId = session.id;
    connection.approved = true;
    connection.lastSeenAt = this.now();
    await this.store.heartbeat(
      session.id,
      message.deviceId,
      this.config.publicConfig.limits.pairedSessionTtlSeconds,
    );

    const peerDevice = role === "host" ? session.guestDevice : session.hostDevice;
    connection.socket.send({
      type: "session:resumed",
      sessionId: session.id,
      peerDeviceId: peerDevice.id,
      peerDeviceLabel: peerDevice.label,
      role,
    });

    const peer = this.findConnection(session.id, peerDevice.id);
    if (peer !== undefined) {
      peer.socket.send({ type: "peer:connected", peerDeviceId: message.deviceId });
      connection.socket.send({ type: "peer:connected", peerDeviceId: peerDevice.id });
    }
  }

  private async approvePeer(
    connection: ConnectionState,
    message: Extract<ClientMessage, { type: "session:approve-peer" }>,
  ): Promise<void> {
    const session = await this.requireHost(connection, message.sessionId, message.deviceId);
    if (session === undefined) {
      return;
    }

    const pending = this.pendingJoinsBySession.get(message.sessionId);
    if (pending === undefined || pending.guestDeviceId !== message.peerDeviceId) {
      this.sendError(connection, "peer_disconnected", "Peer request is no longer pending.");
      return;
    }

    const guest = this.connections.get(pending.guestSocketId);
    if (guest === undefined) {
      this.pendingJoinsBySession.delete(message.sessionId);
      this.sendError(connection, "peer_disconnected", "Peer is no longer connected.");
      return;
    }

    const updated = await this.store.attachGuest({
      sessionId: message.sessionId,
      guestDeviceId: pending.guestDeviceId,
      guestLabel: pending.guestDeviceLabel,
      ttlSeconds: this.config.publicConfig.limits.pairedSessionTtlSeconds,
    });
    if (updated === undefined) {
      this.sendError(connection, "session_not_found", "Session not found.");
      return;
    }

    this.pendingJoinsBySession.delete(message.sessionId);
    guest.approved = true;
    guest.sessionId = message.sessionId;
    connection.approved = true;

    guest.socket.send({
      type: "session:joined",
      sessionId: message.sessionId,
      peerDeviceId: session.hostDeviceId,
      peerDeviceLabel: session.hostDevice.label,
    });
    connection.socket.send({ type: "peer:connected", peerDeviceId: pending.guestDeviceId });
  }

  private async rejectPeer(
    connection: ConnectionState,
    message: Extract<ClientMessage, { type: "session:reject-peer" }>,
  ): Promise<void> {
    const session = await this.requireHost(connection, message.sessionId, message.deviceId);
    if (session === undefined) {
      return;
    }

    const pending = this.pendingJoinsBySession.get(message.sessionId);
    if (pending === undefined || pending.guestDeviceId !== message.peerDeviceId) {
      this.sendError(connection, "peer_disconnected", "Peer request is no longer pending.");
      return;
    }

    this.pendingJoinsBySession.delete(message.sessionId);
    await this.store.updateStatus(
      message.sessionId,
      "waiting",
      this.config.publicConfig.limits.unpairedSessionTtlSeconds,
    );
    this.connections
      .get(pending.guestSocketId)
      ?.socket.send({ type: "session:rejected", reason: "rejected_by_host" });
  }

  private async ping(
    connection: ConnectionState,
    message: Extract<ClientMessage, { type: "presence:ping" }>,
  ): Promise<void> {
    if (!this.matchesConnection(connection, message.sessionId, message.deviceId)) {
      this.sendError(connection, "not_authorized", "Device is not connected to this session.");
      return;
    }
    connection.lastSeenAt = this.now();
    await this.store.heartbeat(
      message.sessionId,
      message.deviceId,
      this.config.publicConfig.limits.pairedSessionTtlSeconds,
    );
  }

  private async relay(
    connection: ConnectionState,
    message: Extract<
      ClientMessage,
      { type: "webrtc:offer" | "webrtc:answer" | "webrtc:ice-candidate" | "crypto:public-key" }
    >,
  ): Promise<void> {
    if (!this.matchesConnection(connection, message.sessionId, message.fromDeviceId)) {
      this.sendError(connection, "not_authorized", "Device is not connected to this session.");
      return;
    }
    const session = await this.store.getById(message.sessionId, { includeExpired: true });
    if (session === undefined) {
      this.sendError(connection, "session_not_found", "Session not found.");
      return;
    }
    if (session.status === "ended") {
      this.sendError(connection, "session_ended", "Session has ended.");
      return;
    }
    if (session.status === "expired") {
      this.sendError(connection, "session_expired", "Session has expired.");
      return;
    }
    if (!connection.approved) {
      this.sendError(connection, "peer_not_approved", "Peer must be approved before signaling.");
      return;
    }
    if (session.status !== "connected" || session.guestDeviceId === undefined) {
      this.sendError(connection, "peer_not_approved", "Peer must be approved before signaling.");
      return;
    }
    if (!this.checkSignalingRate(connection, message.sessionId)) {
      return;
    }

    const targetDeviceId =
      message.fromDeviceId === session.hostDeviceId ? session.guestDeviceId : session.hostDeviceId;
    const target = this.findConnection(message.sessionId, targetDeviceId);
    if (target === undefined) {
      this.sendError(connection, "peer_disconnected", "Peer is not connected.");
      return;
    }

    if (message.type === "webrtc:offer" || message.type === "webrtc:answer") {
      target.socket.send({
        type: message.type,
        fromDeviceId: message.fromDeviceId,
        sdp: message.sdp,
      });
      return;
    }
    if (message.type === "webrtc:ice-candidate") {
      target.socket.send({
        type: message.type,
        fromDeviceId: message.fromDeviceId,
        candidate: message.candidate,
      });
      return;
    }
    target.socket.send({
      type: "crypto:public-key",
      fromDeviceId: message.fromDeviceId,
      publicKey: message.publicKey,
    });
  }

  private async endSession(
    connection: ConnectionState,
    message: Extract<ClientMessage, { type: "session:end" }>,
  ): Promise<void> {
    if (!this.matchesConnection(connection, message.sessionId, message.deviceId)) {
      this.sendError(connection, "not_authorized", "Device is not connected to this session.");
      return;
    }

    const ended = await this.store.end(message.sessionId, message.deviceId, "websocket");
    if (ended === undefined) {
      this.sendError(connection, "not_authorized", "Device is not allowed to end this session.");
      return;
    }

    this.sendToSession(message.sessionId, { type: "session:ended" });
    this.clearSessionConnections(message.sessionId);
  }

  private async requireHost(
    connection: ConnectionState,
    sessionId: string,
    deviceId: string,
  ): Promise<StoredSession | undefined> {
    if (!this.matchesConnection(connection, sessionId, deviceId)) {
      this.sendError(connection, "not_authorized", "Device is not connected to this session.");
      return undefined;
    }
    const session = await this.store.getById(sessionId, { includeExpired: true });
    if (session === undefined) {
      this.sendError(connection, "session_not_found", "Session not found.");
      return undefined;
    }
    if (session.hostDeviceId !== deviceId) {
      this.sendError(connection, "not_authorized", "Only the host can approve or reject peers.");
      return undefined;
    }
    return session;
  }

  private claimDevice(
    connection: ConnectionState,
    deviceId: string,
    deviceLabel: string | undefined,
    role: "host" | "guest",
  ): boolean {
    if (connection.deviceId !== undefined && connection.deviceId !== deviceId) {
      this.sendError(
        connection,
        "invalid_device_id",
        "This socket is already bound to another device.",
      );
      return false;
    }

    const existingSocketId = this.connectionIdsByDevice.get(deviceId);
    if (existingSocketId !== undefined && existingSocketId !== connection.socket.id) {
      this.sendError(
        connection,
        "invalid_device_id",
        "Reconnect is not supported for active device IDs.",
      );
      return false;
    }

    connection.deviceId = deviceId;
    connection.deviceLabel = readLabel(deviceLabel, role === "host" ? "Host" : "Guest");
    connection.role = role;
    connection.lastSeenAt = this.now();
    this.connectionIdsByDevice.set(deviceId, connection.socket.id);
    return true;
  }

  private removeSocket(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (connection === undefined) {
      return;
    }

    this.connections.delete(socketId);
    if (connection.deviceId !== undefined) {
      this.connectionIdsByDevice.delete(connection.deviceId);
    }

    if (connection.sessionId !== undefined) {
      const pending = this.pendingJoinsBySession.get(connection.sessionId);
      if (pending?.guestSocketId === socketId) {
        this.pendingJoinsBySession.delete(connection.sessionId);
        void this.store.updateStatus(
          connection.sessionId,
          "waiting",
          this.config.publicConfig.limits.unpairedSessionTtlSeconds,
        );
      }

      const peer = this.findPeerConnection(connection);
      if (peer !== undefined && connection.deviceId !== undefined) {
        peer.socket.send({ type: "peer:disconnected", peerDeviceId: connection.deviceId });
      }
    }
  }

  private findPeerConnection(connection: ConnectionState): ConnectionState | undefined {
    if (connection.sessionId === undefined || connection.deviceId === undefined) {
      return undefined;
    }
    for (const candidate of this.connections.values()) {
      if (
        candidate.socket.id !== connection.socket.id &&
        candidate.sessionId === connection.sessionId &&
        candidate.deviceId !== connection.deviceId
      ) {
        return candidate;
      }
    }
    return undefined;
  }

  private findConnection(sessionId: string, deviceId: string): ConnectionState | undefined {
    const socketId = this.connectionIdsByDevice.get(deviceId);
    const connection = socketId === undefined ? undefined : this.connections.get(socketId);
    return connection?.sessionId === sessionId ? connection : undefined;
  }

  private matchesConnection(
    connection: ConnectionState,
    sessionId: string,
    deviceId: string,
  ): boolean {
    return connection.sessionId === sessionId && connection.deviceId === deviceId;
  }

  private sendToSession(sessionId: string, message: ServerMessage): void {
    for (const connection of this.connections.values()) {
      if (connection.sessionId === sessionId) {
        connection.socket.send(message);
      }
    }
  }

  private clearSessionConnections(sessionId: string): void {
    this.pendingJoinsBySession.delete(sessionId);
    for (const connection of this.connections.values()) {
      if (connection.sessionId === sessionId) {
        connection.approved = false;
      }
    }
  }

  private sendError(connection: ConnectionState, code: ProtocolErrorCode, message: string): void {
    connection.socket.send({ type: "error", code, message });
  }

  private checkSignalingRate(connection: ConnectionState, sessionId: string): boolean {
    const limit = this.rateLimiter.hit(
      `ws:signal:${sessionId}`,
      this.config.rateLimits.maxSignalingMessagesPerMinutePerSession,
      60_000,
    );
    if (!limit.allowed) {
      this.sendError(connection, "rate_limited", "Too many signaling messages for this session.");
      return false;
    }
    return true;
  }
}

function readLabel(value: string | undefined, fallback: string): string {
  return value === undefined || value.trim() === "" ? fallback : value.trim().slice(0, 80);
}
