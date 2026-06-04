import { PLAN_LIMITS, type ServerConfig } from "@handitoff/config";
import {
  validateClientMessage,
  type ClientMessage,
  type ProtocolErrorCode,
  type ServerMessage,
} from "@handitoff/protocol";

import { FixedWindowRateLimiter } from "./rate-limits.js";
import type { SessionStore, StoredSession } from "./session-store.js";
import type { AccountDevice, AccountPlan, AccountStore } from "./account-store.js";

export type SignalingAccountUser = {
  id: string;
  plan: AccountPlan;
};

export type SignalingSocket = {
  readonly id: string;
  readonly accountUser?: SignalingAccountUser | undefined;
  send(message: ServerMessage): void;
  close(code?: number, reason?: string): void;
  onMessage(handler: (raw: string) => void): void;
  onClose(handler: () => void): void;
};

export type SignalingHubOptions = {
  config: ServerConfig;
  store: SessionStore;
  accountStore?: AccountStore;
  rateLimiter?: FixedWindowRateLimiter;
  now?: () => number;
  heartbeatTimeoutMs?: number;
};

type ConnectionState = {
  socket: SignalingSocket;
  accountUser?: SignalingAccountUser;
  deviceId?: string;
  deviceLabel?: string;
  sessionId?: string;
  role?: "host" | "guest";
  accountDeviceRegistered: boolean;
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

type PendingAccountHandoff = {
  requestId: string;
  sessionId: string;
  publicCode: string;
  fromDeviceId: string;
  fromDeviceLabel: string;
  fromSocketId: string;
  targetDeviceId: string;
  targetSocketId: string;
};

export class SignalingHub {
  private readonly config: ServerConfig;
  private readonly store: SessionStore;
  private readonly accountStore: AccountStore | undefined;
  private readonly rateLimiter: FixedWindowRateLimiter;
  private readonly now: () => number;
  private readonly heartbeatTimeoutMs: number;
  private readonly connections = new Map<string, ConnectionState>();
  private readonly connectionIdsByDevice = new Map<string, string>();
  private readonly pendingJoinsBySession = new Map<string, PendingJoin>();
  private readonly pendingAccountHandoffsByRequest = new Map<string, PendingAccountHandoff>();

  public constructor(options: SignalingHubOptions) {
    this.config = options.config;
    this.store = options.store;
    this.accountStore = options.accountStore;
    this.rateLimiter =
      options.rateLimiter ??
      new FixedWindowRateLimiter(options.now === undefined ? {} : { now: options.now });
    this.now = options.now ?? Date.now;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 30_000;
  }

  public addSocket(socket: SignalingSocket): void {
    this.connections.set(socket.id, {
      socket,
      ...(socket.accountUser === undefined ? {} : { accountUser: socket.accountUser }),
      accountDeviceRegistered: false,
      approved: false,
      lastSeenAt: this.now(),
    });

    socket.onMessage((raw) => void this.handleRawMessage(socket.id, raw));
    socket.onClose(() => void this.removeSocket(socket.id));
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
        void this.removeSocket(connection.socket.id);
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
      case "device:register":
        await this.registerAccountDevice(connection, message);
        return;
      case "device:heartbeat":
        await this.heartbeatAccountDevice(connection, message);
        return;
      case "account-handoff:start":
        await this.startAccountHandoff(connection, message);
        return;
      case "account-handoff:accept":
        await this.acceptAccountHandoff(connection, message);
        return;
      case "account-handoff:reject":
        await this.rejectAccountHandoff(connection, message);
        return;
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

    const accountLimits = this.accountLimitsFor(connection);
    const limits = accountLimits ?? this.config.publicConfig.limits;
    const session = await this.store.create({
      hostDeviceId: message.deviceId,
      hostLabel: readLabel(message.deviceLabel, "Host"),
      hostIpKey: "websocket",
      ttlSeconds: limits.unpairedSessionTtlSeconds,
      ...(connection.accountUser === undefined ? {} : { ownerUserId: connection.accountUser.id }),
      tier:
        connection.accountUser?.plan === "pro"
          ? "pro"
          : connection.accountUser === undefined
            ? "guest"
            : "free",
      ...(accountLimits === undefined ? {} : { limits: accountLimits }),
    });
    await this.recordSessionCreated(session, connection);

    connection.sessionId = session.id;
    connection.approved = true;
    connection.socket.send({
      type: "session:created",
      sessionId: session.id,
      publicCode: session.publicCode,
      joinUrl: new URL(`/join/${session.publicCode}`, this.config.publicConfig.appUrl).toString(),
      expiresAt: session.expiresAt,
      ...(session.limits === undefined ? {} : { limits: session.limits }),
    });
  }

  private async registerAccountDevice(
    connection: ConnectionState,
    message: Extract<ClientMessage, { type: "device:register" }>,
  ): Promise<void> {
    if (connection.accountUser === undefined || this.accountStore === undefined) {
      this.sendError(connection, "not_authorized", "Sign in is required.");
      return;
    }
    if (!this.bindDevice(connection, message.deviceId, message.deviceLabel)) {
      return;
    }

    const browser = readMetadata(message.browser);
    const os = readMetadata(message.os);
    const deviceType = readMetadata(message.deviceType);
    const device = await this.accountStore.upsertDevice({
      id: message.deviceId,
      userId: connection.accountUser.id,
      label: readLabel(message.deviceLabel, "This device"),
      ...(browser === undefined ? {} : { browser }),
      ...(os === undefined ? {} : { os }),
      ...(deviceType === undefined ? {} : { deviceType }),
      now: new Date(this.now()),
    });
    connection.deviceLabel = device.label;
    connection.accountDeviceRegistered = true;
    await this.broadcastDeviceList(connection.accountUser.id);
  }

  private async heartbeatAccountDevice(
    connection: ConnectionState,
    message: Extract<ClientMessage, { type: "device:heartbeat" }>,
  ): Promise<void> {
    if (
      connection.accountUser === undefined ||
      this.accountStore === undefined ||
      connection.deviceId !== message.deviceId
    ) {
      this.sendError(connection, "not_authorized", "Device is not registered on this socket.");
      return;
    }
    connection.lastSeenAt = this.now();
    await this.accountStore.touchDevice(
      connection.accountUser.id,
      message.deviceId,
      new Date(this.now()),
    );
    await this.broadcastDeviceList(connection.accountUser.id);
  }

  private async startAccountHandoff(
    connection: ConnectionState,
    message: Extract<ClientMessage, { type: "account-handoff:start" }>,
  ): Promise<void> {
    if (connection.accountUser === undefined || this.accountStore === undefined) {
      this.sendError(connection, "not_authorized", "Sign in is required.");
      return;
    }
    if (message.targetDeviceId === message.deviceId) {
      this.sendError(connection, "invalid_device_id", "Target device must be a different device.");
      return;
    }
    if (!this.bindDevice(connection, message.deviceId, message.deviceLabel)) {
      return;
    }

    const target = this.findAccountDeviceConnection(
      connection.accountUser.id,
      message.targetDeviceId,
    );
    if (target === undefined) {
      this.sendError(connection, "device_not_found", "Target device is not online.");
      return;
    }

    const activeSessions = await this.store.countActiveByIp("websocket");
    if (activeSessions >= this.config.rateLimits.maxActiveSessionsPerIp) {
      this.sendError(connection, "rate_limited", "Too many active sessions for this IP address.");
      return;
    }

    const accountLimits = this.accountLimitsFor(connection);
    const limits = accountLimits ?? this.config.publicConfig.limits;
    const fromDeviceLabel = readLabel(message.deviceLabel ?? connection.deviceLabel, "This device");
    const session = await this.store.create({
      hostDeviceId: message.deviceId,
      hostLabel: fromDeviceLabel,
      hostIpKey: "websocket",
      ttlSeconds: limits.unpairedSessionTtlSeconds,
      ownerUserId: connection.accountUser.id,
      tier: connection.accountUser.plan === "pro" ? "pro" : "free",
      ...(accountLimits === undefined ? {} : { limits: accountLimits }),
    });
    await this.recordSessionCreated(session, connection);
    const requestId = message.requestId ?? globalThis.crypto.randomUUID();
    connection.sessionId = session.id;
    connection.role = "host";
    connection.approved = true;
    this.pendingAccountHandoffsByRequest.set(requestId, {
      requestId,
      sessionId: session.id,
      publicCode: session.publicCode,
      fromDeviceId: message.deviceId,
      fromDeviceLabel,
      fromSocketId: connection.socket.id,
      targetDeviceId: message.targetDeviceId,
      targetSocketId: target.socket.id,
    });

    connection.socket.send({
      type: "account-handoff:started",
      requestId,
      sessionId: session.id,
      targetDeviceId: message.targetDeviceId,
      publicCode: session.publicCode,
      joinUrl: new URL(`/join/${session.publicCode}`, this.config.publicConfig.appUrl).toString(),
      expiresAt: session.expiresAt,
      ...(session.limits === undefined ? {} : { limits: session.limits }),
    });
    target.socket.send({
      type: "account-handoff:request",
      requestId,
      sessionId: session.id,
      fromDeviceId: message.deviceId,
      fromDeviceLabel,
      targetDeviceId: message.targetDeviceId,
      ...(session.limits === undefined ? {} : { limits: session.limits }),
    });
  }

  private async acceptAccountHandoff(
    connection: ConnectionState,
    message: Extract<ClientMessage, { type: "account-handoff:accept" }>,
  ): Promise<void> {
    const pending = this.pendingAccountHandoffsByRequest.get(message.requestId);
    if (
      pending === undefined ||
      pending.targetSocketId !== connection.socket.id ||
      pending.targetDeviceId !== message.deviceId
    ) {
      this.sendError(connection, "peer_disconnected", "Handoff request is no longer pending.");
      return;
    }

    const session = await this.store.getById(pending.sessionId, { includeExpired: true });
    if (session === undefined) {
      this.pendingAccountHandoffsByRequest.delete(message.requestId);
      this.sendError(connection, "session_not_found", "Session not found.");
      return;
    }
    if (session.status === "expired" || session.status === "ended") {
      this.pendingAccountHandoffsByRequest.delete(message.requestId);
      this.sendError(
        connection,
        session.status === "expired" ? "session_expired" : "session_ended",
        session.status === "expired" ? "Session has expired." : "Session has ended.",
      );
      return;
    }

    const limits = session.limits ?? this.config.publicConfig.limits;
    const updated = await this.store.attachGuest({
      sessionId: pending.sessionId,
      guestDeviceId: pending.targetDeviceId,
      guestLabel: readLabel(connection.deviceLabel, "This device"),
      ttlSeconds: limits.pairedSessionTtlSeconds,
    });
    if (updated === undefined) {
      this.sendError(connection, "session_not_found", "Session not found.");
      return;
    }
    await this.recordPeerApproved(updated, connection, pending.targetDeviceId);

    const initiator = this.connections.get(pending.fromSocketId);
    this.pendingAccountHandoffsByRequest.delete(message.requestId);
    connection.sessionId = pending.sessionId;
    connection.role = "guest";
    connection.approved = true;
    if (initiator !== undefined) {
      initiator.approved = true;
      initiator.socket.send({
        type: "peer:connected",
        peerDeviceId: pending.targetDeviceId,
        ...(session.limits === undefined ? {} : { limits: session.limits }),
      });
    }
    connection.socket.send({
      type: "session:joined",
      sessionId: pending.sessionId,
      peerDeviceId: pending.fromDeviceId,
      peerDeviceLabel: pending.fromDeviceLabel,
      ...(session.limits === undefined ? {} : { limits: session.limits }),
    });
  }

  private async rejectAccountHandoff(
    connection: ConnectionState,
    message: Extract<ClientMessage, { type: "account-handoff:reject" }>,
  ): Promise<void> {
    const pending = this.pendingAccountHandoffsByRequest.get(message.requestId);
    if (
      pending === undefined ||
      pending.targetSocketId !== connection.socket.id ||
      pending.targetDeviceId !== message.deviceId
    ) {
      this.sendError(connection, "peer_disconnected", "Handoff request is no longer pending.");
      return;
    }

    this.pendingAccountHandoffsByRequest.delete(message.requestId);
    await this.store.end(pending.sessionId, pending.fromDeviceId, "account_handoff_rejected");
    this.connections.get(pending.fromSocketId)?.socket.send({
      type: "account-handoff:rejected",
      requestId: message.requestId,
      reason: "rejected_by_target",
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
    await this.store.updateStatus(session.id, "waiting");

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
    if (
      (session.status !== "connected" &&
        session.status !== "partially_connected" &&
        session.status !== "reconnectable") ||
      session.guestDevice === undefined
    ) {
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
    await this.store.heartbeat(session.id, message.deviceId);
    await this.store.updateStatus(session.id, "connected");
    await this.recordParticipantPresence(session, message.deviceId, "connected");
    const peerDevice = role === "host" ? session.guestDevice : session.hostDevice;
    if (this.accountStore !== undefined && session.ownerUserId !== undefined) {
      await this.accountStore.upsertHandoffSession({
        id: session.id,
        ownerUserId: session.ownerUserId,
        publicCode: session.publicCode,
        tier: session.tier ?? "free",
        status: "connected",
        createdAt: new Date(session.createdAt),
        activeExpiresAt: new Date(session.expiresAt),
        participantCount: participantCount(session),
        connectedDeviceCount: this.connectedApprovedCount(session.id),
      });
      await this.accountStore.recordHandoffActivity({
        userId: session.ownerUserId,
        sessionId: session.id,
        eventType: "device_reconnected",
        title: "Device reconnected",
        summary: `${deviceLabel} returned to the session`,
        deviceLabel,
        peerLabel: peerDevice.label,
        createdAt: new Date(this.now()),
      });
    }

    connection.socket.send({
      type: "session:resumed",
      sessionId: session.id,
      peerDeviceId: peerDevice.id,
      peerDeviceLabel: peerDevice.label,
      role,
      ...(session.limits === undefined ? {} : { limits: session.limits }),
    });

    const peer = this.findConnection(session.id, peerDevice.id);
    if (peer !== undefined) {
      peer.socket.send({
        type: "peer:connected",
        peerDeviceId: message.deviceId,
        ...(session.limits === undefined ? {} : { limits: session.limits }),
      });
      connection.socket.send({
        type: "peer:connected",
        peerDeviceId: peerDevice.id,
        ...(session.limits === undefined ? {} : { limits: session.limits }),
      });
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

    const limits = session.limits ?? this.config.publicConfig.limits;
    const updated = await this.store.attachGuest({
      sessionId: message.sessionId,
      guestDeviceId: pending.guestDeviceId,
      guestLabel: pending.guestDeviceLabel,
      ttlSeconds: limits.pairedSessionTtlSeconds,
    });
    if (updated === undefined) {
      this.sendError(connection, "session_not_found", "Session not found.");
      return;
    }
    await this.recordPeerApproved(updated, guest, pending.guestDeviceId);

    this.pendingJoinsBySession.delete(message.sessionId);
    guest.approved = true;
    guest.sessionId = message.sessionId;
    connection.approved = true;

    guest.socket.send({
      type: "session:joined",
      sessionId: message.sessionId,
      peerDeviceId: session.hostDeviceId,
      peerDeviceLabel: session.hostDevice.label,
      ...(session.limits === undefined ? {} : { limits: session.limits }),
    });
    connection.socket.send({
      type: "peer:connected",
      peerDeviceId: pending.guestDeviceId,
      ...(session.limits === undefined ? {} : { limits: session.limits }),
    });
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
    const limits = session.limits ?? this.config.publicConfig.limits;
    await this.store.updateStatus(message.sessionId, "waiting", limits.unpairedSessionTtlSeconds);
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
    await this.store.heartbeat(message.sessionId, message.deviceId);
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
    if (
      (session.status !== "connected" &&
        session.status !== "partially_connected" &&
        session.status !== "reconnectable") ||
      session.guestDeviceId === undefined
    ) {
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
    if (this.accountStore !== undefined && ended.ownerUserId !== undefined) {
      await this.accountStore.upsertHandoffSession({
        id: ended.id,
        ownerUserId: ended.ownerUserId,
        publicCode: ended.publicCode,
        tier: ended.tier ?? "free",
        status: "ended",
        createdAt: new Date(ended.createdAt),
        endedAt: new Date(ended.endedAt ?? this.now()),
        ...(ended.endReason === undefined ? {} : { endReason: ended.endReason }),
        participantCount: participantCount(ended),
        connectedDeviceCount: 0,
      });
      await this.accountStore.recordHandoffActivity({
        userId: ended.ownerUserId,
        sessionId: ended.id,
        eventType: "session_ended",
        title: "Session ended",
        ...(ended.endReason === undefined ? {} : { summary: ended.endReason }),
        createdAt: new Date(ended.endedAt ?? this.now()),
      });
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

  private async recordSessionCreated(
    session: StoredSession,
    connection: ConnectionState,
  ): Promise<void> {
    if (this.accountStore === undefined || session.ownerUserId === undefined) {
      return;
    }
    await this.accountStore.upsertHandoffSession({
      id: session.id,
      ownerUserId: session.ownerUserId,
      publicCode: session.publicCode,
      tier: session.tier ?? "free",
      status: "waiting",
      createdAt: new Date(session.createdAt),
      pairingExpiresAt: new Date(session.expiresAt),
      participantCount: 1,
      connectedDeviceCount: 1,
    });
    await this.accountStore.upsertHandoffParticipant({
      sessionId: session.id,
      deviceId: session.hostDeviceId,
      deviceLabel: session.hostDevice.label,
      role: "host",
      status: "connected",
      joinedAt: new Date(session.createdAt),
      approvedAt: new Date(session.createdAt),
      ...(connection.accountUser?.id === undefined ? {} : { userId: connection.accountUser.id }),
    });
    await this.accountStore.recordHandoffActivity({
      userId: session.ownerUserId,
      sessionId: session.id,
      eventType: "session_created",
      title: "Session created",
      deviceLabel: session.hostDevice.label,
      createdAt: new Date(session.createdAt),
    });
  }

  private async recordPeerApproved(
    session: StoredSession,
    guestConnection: ConnectionState,
    guestDeviceId: string,
  ): Promise<void> {
    if (
      this.accountStore === undefined ||
      session.ownerUserId === undefined ||
      session.guestDevice === undefined
    ) {
      return;
    }
    await this.accountStore.upsertHandoffSession({
      id: session.id,
      ownerUserId: session.ownerUserId,
      publicCode: session.publicCode,
      tier: session.tier ?? "free",
      status: "connected",
      createdAt: new Date(session.createdAt),
      activeExpiresAt: new Date(session.expiresAt),
      participantCount: 2,
      connectedDeviceCount: 2,
    });
    await this.accountStore.upsertHandoffParticipant({
      sessionId: session.id,
      deviceId: guestDeviceId,
      deviceLabel: session.guestDevice.label,
      role: "guest",
      status: "connected",
      joinedAt: new Date(session.guestDevice.connectedAt),
      approvedAt: new Date(session.guestDevice.connectedAt),
      ...(guestConnection.accountUser?.id === undefined
        ? {}
        : { userId: guestConnection.accountUser.id }),
    });
    await this.accountStore.recordHandoffActivity({
      userId: session.ownerUserId,
      sessionId: session.id,
      eventType: "peer_connected",
      title: "Peer connected",
      deviceLabel: session.guestDevice.label,
      peerLabel: session.hostDevice.label,
      createdAt: new Date(session.guestDevice.connectedAt),
    });
  }

  private async recordParticipantPresence(
    session: StoredSession,
    deviceId: string,
    status: "connected" | "disconnected" | "left",
  ): Promise<void> {
    if (this.accountStore === undefined || session.ownerUserId === undefined) {
      return;
    }
    const participant =
      deviceId === session.hostDeviceId
        ? session.hostDevice
        : deviceId === session.guestDeviceId
          ? session.guestDevice
          : undefined;
    if (participant === undefined) {
      return;
    }
    await this.accountStore.upsertHandoffParticipant({
      sessionId: session.id,
      deviceId,
      deviceLabel: participant.label,
      role: participant.role,
      status,
      joinedAt: new Date(participant.connectedAt),
      approvedAt: new Date(participant.connectedAt),
      ...(deviceId === session.hostDeviceId ? { userId: session.ownerUserId } : {}),
      ...(status === "disconnected" ? { disconnectedAt: new Date(this.now()) } : {}),
      ...(status === "left" ? { leftAt: new Date(this.now()) } : {}),
    });
  }

  private async handleApprovedDisconnect(
    connection: ConnectionState,
    peer: ConnectionState | undefined,
  ): Promise<void> {
    if (connection.sessionId === undefined || connection.deviceId === undefined) {
      return;
    }
    const session = await this.store.getById(connection.sessionId, { includeExpired: true });
    if (session === undefined || session.status === "ended" || session.status === "expired") {
      return;
    }
    const connectedCount = this.connectedApprovedCount(connection.sessionId);
    if (connectedCount > 0) {
      await this.store.updateStatus(connection.sessionId, "reconnectable");
      await this.recordParticipantPresence(session, connection.deviceId, "disconnected");
      if (this.accountStore !== undefined && session.ownerUserId !== undefined) {
        await this.accountStore.upsertHandoffSession({
          id: session.id,
          ownerUserId: session.ownerUserId,
          publicCode: session.publicCode,
          tier: session.tier ?? "free",
          status: "reconnectable",
          createdAt: new Date(session.createdAt),
          activeExpiresAt: new Date(session.expiresAt),
          participantCount: participantCount(session),
          connectedDeviceCount: connectedCount,
        });
        await this.accountStore.recordHandoffActivity({
          userId: session.ownerUserId,
          sessionId: session.id,
          eventType: "device_disconnected",
          title: "Device disconnected",
          summary: `${connection.deviceLabel ?? "Device"} left the session`,
          ...(connection.deviceLabel === undefined ? {} : { deviceLabel: connection.deviceLabel }),
          ...(peer?.deviceLabel === undefined ? {} : { peerLabel: peer.deviceLabel }),
          createdAt: new Date(this.now()),
        });
      }
      return;
    }

    const ended = await this.store.end(
      connection.sessionId,
      connection.deviceId,
      "all_devices_disconnected",
    );
    if (ended === undefined) {
      return;
    }
    if (this.accountStore !== undefined && ended.ownerUserId !== undefined) {
      await this.recordParticipantPresence(ended, connection.deviceId, "left");
      await this.accountStore.upsertHandoffSession({
        id: ended.id,
        ownerUserId: ended.ownerUserId,
        publicCode: ended.publicCode,
        tier: ended.tier ?? "free",
        status: "ended",
        createdAt: new Date(ended.createdAt),
        endedAt: new Date(ended.endedAt ?? this.now()),
        endReason: "all_devices_disconnected",
        participantCount: participantCount(ended),
        connectedDeviceCount: 0,
      });
      await this.accountStore.recordHandoffActivity({
        userId: ended.ownerUserId,
        sessionId: ended.id,
        eventType: "session_ended",
        title: "Session ended",
        summary: "All devices disconnected",
        createdAt: new Date(ended.endedAt ?? this.now()),
      });
    }
    this.clearSessionConnections(connection.sessionId);
  }

  private claimDevice(
    connection: ConnectionState,
    deviceId: string,
    deviceLabel: string | undefined,
    role: "host" | "guest",
  ): boolean {
    if (!this.bindDevice(connection, deviceId, deviceLabel)) {
      return false;
    }

    connection.role = role;
    return true;
  }

  private bindDevice(
    connection: ConnectionState,
    deviceId: string,
    deviceLabel: string | undefined,
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
    connection.deviceLabel = readLabel(deviceLabel, connection.deviceLabel ?? "This device");
    connection.lastSeenAt = this.now();
    this.connectionIdsByDevice.set(deviceId, connection.socket.id);
    return true;
  }

  private async removeSocket(socketId: string): Promise<void> {
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
        await this.store.updateStatus(
          connection.sessionId,
          "waiting",
          this.config.publicConfig.limits.unpairedSessionTtlSeconds,
        );
      }

      const peer = this.findPeerConnection(connection);
      if (peer !== undefined && connection.deviceId !== undefined) {
        peer.socket.send({ type: "peer:disconnected", peerDeviceId: connection.deviceId });
      }
      if (connection.approved && connection.deviceId !== undefined) {
        await this.handleApprovedDisconnect(connection, peer);
      }
    }

    if (connection.accountUser !== undefined) {
      void this.broadcastDeviceList(connection.accountUser.id);
    }

    for (const pending of [...this.pendingAccountHandoffsByRequest.values()]) {
      if (pending.fromSocketId === socketId || pending.targetSocketId === socketId) {
        this.pendingAccountHandoffsByRequest.delete(pending.requestId);
        void this.store.end(
          pending.sessionId,
          pending.fromDeviceId,
          "account_handoff_disconnected",
        );
        const peerSocketId =
          pending.fromSocketId === socketId ? pending.targetSocketId : pending.fromSocketId;
        this.connections.get(peerSocketId)?.socket.send({
          type: "account-handoff:rejected",
          requestId: pending.requestId,
          reason: "peer_disconnected",
        });
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

  private connectedApprovedCount(sessionId: string): number {
    let count = 0;
    for (const connection of this.connections.values()) {
      if (connection.sessionId === sessionId && connection.approved) {
        count += 1;
      }
    }
    return count;
  }

  private findConnection(sessionId: string, deviceId: string): ConnectionState | undefined {
    const socketId = this.connectionIdsByDevice.get(deviceId);
    const connection = socketId === undefined ? undefined : this.connections.get(socketId);
    return connection?.sessionId === sessionId ? connection : undefined;
  }

  private findAccountDeviceConnection(
    userId: string,
    deviceId: string,
  ): ConnectionState | undefined {
    const socketId = this.connectionIdsByDevice.get(deviceId);
    const connection = socketId === undefined ? undefined : this.connections.get(socketId);
    if (
      connection?.accountUser?.id !== userId ||
      !connection.accountDeviceRegistered ||
      connection.deviceId !== deviceId
    ) {
      return undefined;
    }
    return connection;
  }

  private async broadcastDeviceList(userId: string): Promise<void> {
    if (this.accountStore === undefined) {
      return;
    }
    const devices = await this.accountStore.listDevices(userId);
    for (const connection of this.connections.values()) {
      if (connection.accountUser?.id === userId) {
        connection.socket.send({
          type: "device:list",
          devices: devices.map((device) => this.devicePresence(device, connection.deviceId)),
        });
      }
    }
  }

  private devicePresence(device: AccountDevice, currentDeviceId: string | undefined) {
    const online = this.findAccountDeviceConnection(device.userId, device.id) !== undefined;
    return {
      id: device.id,
      label: device.label,
      ...(device.browser === undefined ? {} : { browser: device.browser }),
      ...(device.os === undefined ? {} : { os: device.os }),
      ...(device.deviceType === undefined ? {} : { deviceType: device.deviceType }),
      ...(device.userAgent === undefined ? {} : { userAgent: device.userAgent }),
      online,
      thisDevice: currentDeviceId === device.id,
      lastSeenAt: device.lastSeenAt.toISOString(),
      createdAt: device.createdAt.toISOString(),
      updatedAt: device.updatedAt.toISOString(),
    };
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

  private accountLimitsFor(
    connection: ConnectionState,
  ): (typeof PLAN_LIMITS)[AccountPlan] | undefined {
    return connection.accountUser === undefined
      ? undefined
      : PLAN_LIMITS[connection.accountUser.plan];
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

function readMetadata(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value.trim().slice(0, 80);
}

function participantCount(session: StoredSession): number {
  return session.guestDeviceId === undefined ? 1 : 2;
}
