import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./.prisma/client/client.js";

export type AccountPlan = "free" | "account" | "pro";
export type OAuthProvider = "google";

export type AccountUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  handle?: string;
  defaultDeviceName?: string;
  plan: AccountPlan;
  provider: OAuthProvider;
  providerSubject: string;
  receiveMode: boolean;
  requireSenderName: boolean;
  allowSenderMessage: boolean;
  requireSenderMessage: boolean;
  createdAt: Date;
};

export type AccountDevice = {
  id: string;
  userId: string;
  label: string;
  browser?: string;
  os?: string;
  deviceType?: string;
  userAgent?: string;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type HandoffSessionStatus =
  | "waiting"
  | "connected"
  | "transferring"
  | "partially_connected"
  | "reconnectable"
  | "ended"
  | "expired"
  | "failed";

export type HandoffSessionSummary = {
  id: string;
  code: string;
  type: "standard" | "receive";
  tier: "guest" | "free" | "pro";
  status: HandoffSessionStatus;
  createdAt: Date;
  endedAt?: Date;
  durationMs?: number;
  participantCount: number;
  connectedDeviceCount: number;
  deviceLabels: string[];
  peerLabel?: string;
  transferCount: number;
  fileCount: number;
  totalSize: number;
  success?: boolean;
  connectionType?: "direct" | "relay";
  planTier: "guest" | "free" | "pro";
  endReason?: string;
  failureReason?: string;
};

export type HandoffActivitySummary = {
  id: string;
  sessionId: string;
  transferId?: string;
  eventType: string;
  title: string;
  summary?: string;
  fileCount?: number;
  totalSize?: number;
  sizeBucket?: string;
  deviceLabel?: string;
  peerLabel?: string;
  createdAt: Date;
};

export type UpsertHandoffSessionInput = {
  id: string;
  ownerUserId?: string;
  publicCode: string;
  type?: "standard" | "receive";
  tier: "guest" | "free" | "pro";
  status: HandoffSessionStatus;
  createdAt: Date;
  pairingExpiresAt?: Date;
  activeExpiresAt?: Date;
  endedAt?: Date;
  endReason?: string;
  participantCount?: number;
  connectedDeviceCount?: number;
  success?: boolean;
  failureReason?: string;
};

export type UpsertHandoffParticipantInput = {
  sessionId: string;
  userId?: string;
  deviceId: string;
  deviceLabel: string;
  deviceType?: string;
  browser?: string;
  operatingSystem?: string;
  role: "host" | "guest";
  status: "connected" | "disconnected" | "left" | "rejected";
  joinedAt: Date;
  approvedAt?: Date;
  disconnectedAt?: Date;
  leftAt?: Date;
};

export type RecordHandoffActivityInput = {
  userId?: string;
  sessionId: string;
  transferId?: string;
  eventType: string;
  title: string;
  summary?: string;
  fileCount?: number;
  totalSize?: number;
  sizeBucket?: string;
  deviceLabel?: string;
  peerLabel?: string;
  createdAt?: Date;
};

export type RecordTransferMetadataInput = {
  sessionId: string;
  transferId: string;
  status: "started" | "completed" | "failed" | "cancelled" | "interrupted";
  fileCount?: number;
  totalSize?: number;
  sizeBucket?: string;
  connectionType?: "direct" | "relay";
  failureReason?: string;
  failureStage?: string;
  durationMs?: number;
  occurredAt?: Date;
};

export type UpsertOAuthUserInput = {
  provider: OAuthProvider;
  providerSubject: string;
  email: string;
  name: string;
  avatarUrl?: string;
};

export type UpdateAccountInput = {
  name?: string;
  handle?: string | null;
  defaultDeviceName?: string | null;
};

export type UpdateReceiveSettingsInput = {
  receiveMode?: boolean;
  requireSenderName?: boolean;
  allowSenderMessage?: boolean;
  requireSenderMessage?: boolean;
};

export type UpsertAccountDeviceInput = {
  id: string;
  userId: string;
  label: string;
  browser?: string;
  os?: string;
  deviceType?: string;
  userAgent?: string;
  now?: Date;
};

export interface AccountStore {
  upsertOAuthUser(input: UpsertOAuthUserInput): Promise<AccountUser>;
  createSession(userId: string, expiresAt: Date): Promise<string>;
  getUserBySession(sessionId: string, now?: Date): Promise<AccountUser | undefined>;
  deleteSession(sessionId: string): Promise<void>;
  updateAccount(userId: string, input: UpdateAccountInput): Promise<AccountUser>;
  updateReceiveSettings(userId: string, input: UpdateReceiveSettingsInput): Promise<AccountUser>;
  upsertDevice(input: UpsertAccountDeviceInput): Promise<AccountDevice>;
  listDevices(userId: string): Promise<AccountDevice[]>;
  updateDeviceLabel(
    userId: string,
    deviceId: string,
    label: string,
  ): Promise<AccountDevice | undefined>;
  touchDevice(userId: string, deviceId: string, now?: Date): Promise<AccountDevice | undefined>;
  removeDevice(userId: string, deviceId: string): Promise<boolean>;
  upsertHandoffSession(input: UpsertHandoffSessionInput): Promise<void>;
  upsertHandoffParticipant(input: UpsertHandoffParticipantInput): Promise<void>;
  recordHandoffActivity(input: RecordHandoffActivityInput): Promise<void>;
  recordTransferMetadata(input: RecordTransferMetadataInput): Promise<void>;
  getHandoffSessionOwner(sessionId: string): Promise<string | undefined>;
  listHandoffSessions(userId: string, limit?: number): Promise<HandoffSessionSummary[]>;
  listRecentActivity(userId: string, limit?: number): Promise<HandoffActivitySummary[]>;
  close(): Promise<void>;
}

export class AccountHandleTakenError extends Error {
  public constructor() {
    super("Account handle is already taken.");
    this.name = "AccountHandleTakenError";
  }
}

export class InMemoryAccountStore implements AccountStore {
  private readonly usersById = new Map<string, AccountUser>();
  private readonly userIdByProviderSubject = new Map<string, string>();
  private readonly sessionById = new Map<string, { userId: string; expiresAt: Date }>();
  private readonly devicesById = new Map<string, AccountDevice>();
  private readonly handoffSessionsById = new Map<
    string,
    UpsertHandoffSessionInput & {
      participantCount: number;
      connectedDeviceCount: number;
      transferCount: number;
      fileCount: number;
      totalSize: number;
      connectionType?: "direct" | "relay";
    }
  >();
  private readonly handoffParticipantsByKey = new Map<string, UpsertHandoffParticipantInput>();
  private readonly handoffActivity: (HandoffActivitySummary & { userId?: string })[] = [];
  private readonly handoffTransfersById = new Map<string, RecordTransferMetadataInput>();

  public async upsertOAuthUser(input: UpsertOAuthUserInput): Promise<AccountUser> {
    const existingId = this.userIdByProviderSubject.get(input.providerSubject);
    if (existingId !== undefined) {
      const existing = this.usersById.get(existingId);
      if (existing !== undefined) {
        const updated: AccountUser = {
          ...existing,
          name: input.name,
          email: input.email,
          ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
        };
        this.usersById.set(existingId, updated);
        return updated;
      }
    }

    const user: AccountUser = {
      id: globalThis.crypto.randomUUID(),
      name: input.name,
      email: input.email,
      ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
      plan: "account",
      provider: input.provider,
      providerSubject: input.providerSubject,
      receiveMode: false,
      requireSenderName: true,
      allowSenderMessage: true,
      requireSenderMessage: false,
      createdAt: new Date(),
    };
    this.usersById.set(user.id, user);
    this.userIdByProviderSubject.set(input.providerSubject, user.id);
    return user;
  }

  public async createSession(userId: string, expiresAt: Date): Promise<string> {
    const sessionId = globalThis.crypto.randomUUID();
    this.sessionById.set(sessionId, { userId, expiresAt });
    return sessionId;
  }

  public async getUserBySession(
    sessionId: string,
    now = new Date(),
  ): Promise<AccountUser | undefined> {
    const session = this.sessionById.get(sessionId);
    if (session === undefined) {
      return undefined;
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      this.sessionById.delete(sessionId);
      return undefined;
    }
    return this.usersById.get(session.userId);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    this.sessionById.delete(sessionId);
  }

  public async updateAccount(userId: string, input: UpdateAccountInput): Promise<AccountUser> {
    const existing = this.requireUser(userId);
    const next: AccountUser = { ...existing };
    if (input.name !== undefined) {
      next.name = input.name;
    }
    if (input.handle !== undefined) {
      if (input.handle === null) {
        delete next.handle;
      } else {
        for (const candidate of this.usersById.values()) {
          if (candidate.id !== userId && candidate.handle === input.handle) {
            throw new AccountHandleTakenError();
          }
        }
        next.handle = input.handle;
      }
    }
    if (input.defaultDeviceName !== undefined) {
      if (input.defaultDeviceName === null) {
        delete next.defaultDeviceName;
      } else {
        next.defaultDeviceName = input.defaultDeviceName;
      }
    }
    this.usersById.set(userId, next);
    return next;
  }

  public async updateReceiveSettings(
    userId: string,
    input: UpdateReceiveSettingsInput,
  ): Promise<AccountUser> {
    const existing = this.requireUser(userId);
    const allowSenderMessage = input.allowSenderMessage ?? existing.allowSenderMessage;
    const next: AccountUser = {
      ...existing,
      ...(input.receiveMode === undefined ? {} : { receiveMode: input.receiveMode }),
      ...(input.requireSenderName === undefined
        ? {}
        : { requireSenderName: input.requireSenderName }),
      ...(input.allowSenderMessage === undefined ? {} : { allowSenderMessage }),
      ...(input.requireSenderMessage === undefined
        ? {}
        : { requireSenderMessage: allowSenderMessage && input.requireSenderMessage }),
    };
    this.usersById.set(userId, next);
    return next;
  }

  public async upsertDevice(input: UpsertAccountDeviceInput): Promise<AccountDevice> {
    this.requireUser(input.userId);
    const now = input.now ?? new Date();
    const key = deviceKey(input.userId, input.id);
    const existing = this.devicesById.get(key);
    const device: AccountDevice = {
      ...(existing ?? {
        id: input.id,
        userId: input.userId,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      }),
      userId: input.userId,
      label: input.label,
      ...(input.browser === undefined ? {} : { browser: input.browser }),
      ...(input.os === undefined ? {} : { os: input.os }),
      ...(input.deviceType === undefined ? {} : { deviceType: input.deviceType }),
      ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
      lastSeenAt: now,
      updatedAt: now,
    };
    this.devicesById.set(key, device);
    return device;
  }

  public async listDevices(userId: string): Promise<AccountDevice[]> {
    this.requireUser(userId);
    return [...this.devicesById.values()]
      .filter((device) => device.userId === userId)
      .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime());
  }

  public async updateDeviceLabel(
    userId: string,
    deviceId: string,
    label: string,
  ): Promise<AccountDevice | undefined> {
    const key = deviceKey(userId, deviceId);
    const existing = this.devicesById.get(key);
    if (existing === undefined || existing.userId !== userId) {
      return undefined;
    }
    const updated = { ...existing, label, updatedAt: new Date() };
    this.devicesById.set(key, updated);
    return updated;
  }

  public async touchDevice(
    userId: string,
    deviceId: string,
    now = new Date(),
  ): Promise<AccountDevice | undefined> {
    const key = deviceKey(userId, deviceId);
    const existing = this.devicesById.get(key);
    if (existing === undefined || existing.userId !== userId) {
      return undefined;
    }
    const updated = { ...existing, lastSeenAt: now, updatedAt: now };
    this.devicesById.set(key, updated);
    return updated;
  }

  public async removeDevice(userId: string, deviceId: string): Promise<boolean> {
    const key = deviceKey(userId, deviceId);
    const existing = this.devicesById.get(key);
    if (existing === undefined || existing.userId !== userId) {
      return false;
    }
    this.devicesById.delete(key);
    return true;
  }

  public async upsertHandoffSession(input: UpsertHandoffSessionInput): Promise<void> {
    const existing = this.handoffSessionsById.get(input.id);
    this.handoffSessionsById.set(input.id, {
      ...(existing ?? {
        participantCount: 1,
        connectedDeviceCount: 1,
        transferCount: 0,
        fileCount: 0,
        totalSize: 0,
      }),
      ...input,
      participantCount: input.participantCount ?? existing?.participantCount ?? 1,
      connectedDeviceCount: input.connectedDeviceCount ?? existing?.connectedDeviceCount ?? 1,
      transferCount: existing?.transferCount ?? 0,
      fileCount: existing?.fileCount ?? 0,
      totalSize: existing?.totalSize ?? 0,
      ...(existing?.connectionType === undefined
        ? {}
        : { connectionType: existing.connectionType }),
    });
  }

  public async upsertHandoffParticipant(input: UpsertHandoffParticipantInput): Promise<void> {
    this.handoffParticipantsByKey.set(participantKey(input.sessionId, input.deviceId), input);
    const session = this.handoffSessionsById.get(input.sessionId);
    if (session !== undefined) {
      const participants = this.participantsFor(input.sessionId);
      session.participantCount = participants.length;
      session.connectedDeviceCount = participants.filter(
        (participant) => participant.status === "connected",
      ).length;
    }
  }

  public async recordHandoffActivity(input: RecordHandoffActivityInput): Promise<void> {
    this.handoffActivity.unshift({
      id: (this.handoffActivity.length + 1).toString(),
      sessionId: input.sessionId,
      eventType: input.eventType,
      title: input.title,
      createdAt: input.createdAt ?? new Date(),
      ...(input.userId === undefined ? {} : { userId: input.userId }),
      ...(input.transferId === undefined ? {} : { transferId: input.transferId }),
      ...(input.summary === undefined ? {} : { summary: input.summary }),
      ...(input.fileCount === undefined ? {} : { fileCount: input.fileCount }),
      ...(input.totalSize === undefined ? {} : { totalSize: input.totalSize }),
      ...(input.sizeBucket === undefined ? {} : { sizeBucket: input.sizeBucket }),
      ...(input.deviceLabel === undefined ? {} : { deviceLabel: input.deviceLabel }),
      ...(input.peerLabel === undefined ? {} : { peerLabel: input.peerLabel }),
    });
  }

  public async recordTransferMetadata(input: RecordTransferMetadataInput): Promise<void> {
    const existing = this.handoffTransfersById.get(input.transferId);
    const transfer = { ...(existing ?? input), ...input };
    this.handoffTransfersById.set(input.transferId, transfer);
    const session = this.handoffSessionsById.get(input.sessionId);
    if (session !== undefined) {
      session.transferCount = new Set(
        [...this.handoffTransfersById.values()]
          .filter((candidate) => candidate.sessionId === input.sessionId)
          .map((candidate) => candidate.transferId),
      ).size;
      if (input.fileCount !== undefined)
        session.fileCount = Math.max(session.fileCount, input.fileCount);
      if (input.totalSize !== undefined)
        session.totalSize = Math.max(session.totalSize, input.totalSize);
      if (input.connectionType !== undefined) session.connectionType = input.connectionType;
      if (input.status === "completed") session.success = true;
      if (input.status === "failed" || input.status === "interrupted") {
        session.success = false;
        if (input.failureReason !== undefined) {
          session.failureReason = input.failureReason;
        }
      }
    }
  }

  public async getHandoffSessionOwner(sessionId: string): Promise<string | undefined> {
    return this.handoffSessionsById.get(sessionId)?.ownerUserId;
  }

  public async listHandoffSessions(userId: string, limit = 50): Promise<HandoffSessionSummary[]> {
    return [...this.handoffSessionsById.values()]
      .filter(
        (session) =>
          session.ownerUserId === userId ||
          this.participantsFor(session.id).some((participant) => participant.userId === userId),
      )
      .sort((left, right) => sessionSortTime(right) - sessionSortTime(left))
      .slice(0, limit)
      .map((session) => this.sessionSummary(session, userId));
  }

  public async listRecentActivity(userId: string, limit = 20): Promise<HandoffActivitySummary[]> {
    return this.handoffActivity
      .filter((activity) => activity.userId === userId)
      .slice(0, limit)
      .map((activity) => ({
        id: activity.id,
        sessionId: activity.sessionId,
        eventType: activity.eventType,
        title: activity.title,
        createdAt: activity.createdAt,
        ...(activity.transferId === undefined ? {} : { transferId: activity.transferId }),
        ...(activity.summary === undefined ? {} : { summary: activity.summary }),
        ...(activity.fileCount === undefined ? {} : { fileCount: activity.fileCount }),
        ...(activity.totalSize === undefined ? {} : { totalSize: activity.totalSize }),
        ...(activity.sizeBucket === undefined ? {} : { sizeBucket: activity.sizeBucket }),
        ...(activity.deviceLabel === undefined ? {} : { deviceLabel: activity.deviceLabel }),
        ...(activity.peerLabel === undefined ? {} : { peerLabel: activity.peerLabel }),
      }));
  }

  public async close(): Promise<void> {
    // No resources to release.
  }

  private requireUser(userId: string): AccountUser {
    const user = this.usersById.get(userId);
    if (user === undefined) {
      throw new Error("Account user not found.");
    }
    return user;
  }

  private participantsFor(sessionId: string): UpsertHandoffParticipantInput[] {
    return [...this.handoffParticipantsByKey.values()].filter(
      (participant) => participant.sessionId === sessionId,
    );
  }

  private sessionSummary(
    session: UpsertHandoffSessionInput & {
      participantCount: number;
      connectedDeviceCount: number;
      transferCount: number;
      fileCount: number;
      totalSize: number;
      connectionType?: "direct" | "relay";
    },
    userId: string,
  ): HandoffSessionSummary {
    const participants = this.participantsFor(session.id);
    const peer =
      participants.find((participant) => participant.userId !== userId) ?? participants[1];
    const durationMs =
      session.endedAt === undefined
        ? undefined
        : session.endedAt.getTime() - session.createdAt.getTime();
    return {
      id: session.id,
      code: session.publicCode,
      type: session.type ?? "standard",
      tier: session.tier,
      status: session.status,
      createdAt: session.createdAt,
      participantCount: session.participantCount,
      connectedDeviceCount: session.connectedDeviceCount,
      deviceLabels: participants.map((participant) => participant.deviceLabel),
      transferCount: session.transferCount,
      fileCount: session.fileCount,
      totalSize: session.totalSize,
      planTier: session.tier,
      ...(session.endedAt === undefined ? {} : { endedAt: session.endedAt }),
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(peer?.deviceLabel === undefined ? {} : { peerLabel: peer.deviceLabel }),
      ...(session.success === undefined ? {} : { success: session.success }),
      ...(session.connectionType === undefined ? {} : { connectionType: session.connectionType }),
      ...(session.endReason === undefined ? {} : { endReason: session.endReason }),
      ...(session.failureReason === undefined ? {} : { failureReason: session.failureReason }),
    };
  }
}

export class PrismaAccountStore implements AccountStore {
  private readonly prisma: PrismaClient;

  public constructor(databaseUrl: string, prisma?: PrismaClient) {
    this.prisma =
      prisma ??
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl }),
      });
  }

  public async upsertOAuthUser(input: UpsertOAuthUserInput): Promise<AccountUser> {
    const user = await this.prisma.accountUser.upsert({
      where: { providerSubject: input.providerSubject },
      create: {
        id: globalThis.crypto.randomUUID(),
        provider: input.provider,
        providerSubject: input.providerSubject,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl ?? null,
      },
      update: {
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl ?? null,
      },
    });
    return serializeUser(user);
  }

  public async createSession(userId: string, expiresAt: Date): Promise<string> {
    const sessionId = globalThis.crypto.randomUUID();
    await this.prisma.accountSession.create({
      data: {
        id: sessionId,
        userId,
        expiresAt,
      },
    });
    return sessionId;
  }

  public async getUserBySession(
    sessionId: string,
    now = new Date(),
  ): Promise<AccountUser | undefined> {
    const session = await this.prisma.accountSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (session === null) {
      return undefined;
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      await this.deleteSession(sessionId);
      return undefined;
    }
    return serializeUser(session.user);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    await this.prisma.accountSession.deleteMany({ where: { id: sessionId } });
  }

  public async updateAccount(userId: string, input: UpdateAccountInput): Promise<AccountUser> {
    try {
      const user = await this.prisma.accountUser.update({
        where: { id: userId },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.handle === undefined ? {} : { handle: input.handle }),
          ...(input.defaultDeviceName === undefined
            ? {}
            : { defaultDeviceName: input.defaultDeviceName }),
        },
      });
      return serializeUser(user);
    } catch (error) {
      if (input.handle !== undefined && isPrismaUniqueConstraintError(error)) {
        throw new AccountHandleTakenError();
      }
      throw error;
    }
  }

  public async updateReceiveSettings(
    userId: string,
    input: UpdateReceiveSettingsInput,
  ): Promise<AccountUser> {
    const existing = await this.prisma.accountUser.findUniqueOrThrow({ where: { id: userId } });
    const allowSenderMessage = input.allowSenderMessage ?? existing.allowSenderMessage;
    const user = await this.prisma.accountUser.update({
      where: { id: userId },
      data: {
        ...(input.receiveMode === undefined ? {} : { receiveMode: input.receiveMode }),
        ...(input.requireSenderName === undefined
          ? {}
          : { requireSenderName: input.requireSenderName }),
        ...(input.allowSenderMessage === undefined ? {} : { allowSenderMessage }),
        ...(input.requireSenderMessage === undefined
          ? {}
          : { requireSenderMessage: allowSenderMessage && input.requireSenderMessage }),
      },
    });
    return serializeUser(user);
  }

  public async upsertDevice(input: UpsertAccountDeviceInput): Promise<AccountDevice> {
    const now = input.now ?? new Date();
    const device = await this.prisma.accountDevice.upsert({
      where: { userId_id: { userId: input.userId, id: input.id } },
      create: {
        id: input.id,
        userId: input.userId,
        label: input.label,
        browser: input.browser ?? null,
        os: input.os ?? null,
        deviceType: input.deviceType ?? null,
        userAgent: input.userAgent ?? null,
        lastSeenAt: now,
      },
      update: {
        userId: input.userId,
        label: input.label,
        browser: input.browser ?? null,
        os: input.os ?? null,
        deviceType: input.deviceType ?? null,
        userAgent: input.userAgent ?? null,
        lastSeenAt: now,
        removedAt: null,
      },
    });
    return serializeDevice(device);
  }

  public async listDevices(userId: string): Promise<AccountDevice[]> {
    const devices = await this.prisma.accountDevice.findMany({
      where: { userId, removedAt: null },
      orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    });
    return devices.map(serializeDevice);
  }

  public async updateDeviceLabel(
    userId: string,
    deviceId: string,
    label: string,
  ): Promise<AccountDevice | undefined> {
    const result = await this.prisma.accountDevice.updateMany({
      where: { id: deviceId, userId, removedAt: null },
      data: { label },
    });
    if (result.count === 0) {
      return undefined;
    }
    const device = await this.prisma.accountDevice.findUnique({
      where: { userId_id: { userId, id: deviceId } },
    });
    return device === null ? undefined : serializeDevice(device);
  }

  public async touchDevice(
    userId: string,
    deviceId: string,
    now = new Date(),
  ): Promise<AccountDevice | undefined> {
    const result = await this.prisma.accountDevice.updateMany({
      where: { id: deviceId, userId, removedAt: null },
      data: { lastSeenAt: now },
    });
    if (result.count === 0) {
      return undefined;
    }
    const device = await this.prisma.accountDevice.findUnique({
      where: { userId_id: { userId, id: deviceId } },
    });
    return device === null ? undefined : serializeDevice(device);
  }

  public async removeDevice(userId: string, deviceId: string): Promise<boolean> {
    const result = await this.prisma.accountDevice.updateMany({
      where: { id: deviceId, userId, removedAt: null },
      data: { removedAt: new Date() },
    });
    return result.count > 0;
  }

  public async upsertHandoffSession(input: UpsertHandoffSessionInput): Promise<void> {
    const update = {
      publicCode: input.publicCode,
      type: input.type ?? "standard",
      tier: input.tier,
      status: input.status,
      ...(input.ownerUserId === undefined ? {} : { ownerUserId: input.ownerUserId }),
      ...(input.pairingExpiresAt === undefined ? {} : { pairingExpiresAt: input.pairingExpiresAt }),
      ...(input.activeExpiresAt === undefined ? {} : { activeExpiresAt: input.activeExpiresAt }),
      ...(input.endedAt === undefined ? {} : { endedAt: input.endedAt }),
      ...(input.endReason === undefined ? {} : { endReason: input.endReason }),
      ...(input.participantCount === undefined ? {} : { participantCount: input.participantCount }),
      ...(input.connectedDeviceCount === undefined
        ? {}
        : { connectedDeviceCount: input.connectedDeviceCount }),
      ...(input.success === undefined ? {} : { success: input.success }),
      ...(input.failureReason === undefined ? {} : { failureReason: input.failureReason }),
    };
    await this.prisma.handoffSession.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        ownerUserId: input.ownerUserId ?? null,
        publicCode: input.publicCode,
        type: input.type ?? "standard",
        tier: input.tier,
        status: input.status,
        createdAt: input.createdAt,
        pairingExpiresAt: input.pairingExpiresAt ?? null,
        activeExpiresAt: input.activeExpiresAt ?? null,
        endedAt: input.endedAt ?? null,
        endReason: input.endReason ?? null,
        participantCount: input.participantCount ?? 1,
        connectedDeviceCount: input.connectedDeviceCount ?? 1,
        success: input.success ?? null,
        failureReason: input.failureReason ?? null,
      },
      update,
    });
  }

  public async upsertHandoffParticipant(input: UpsertHandoffParticipantInput): Promise<void> {
    const update = {
      deviceLabel: input.deviceLabel,
      role: input.role,
      status: input.status,
      ...(input.userId === undefined ? {} : { userId: input.userId }),
      ...(input.deviceType === undefined ? {} : { deviceType: input.deviceType }),
      ...(input.browser === undefined ? {} : { browser: input.browser }),
      ...(input.operatingSystem === undefined ? {} : { operatingSystem: input.operatingSystem }),
      ...(input.approvedAt === undefined ? {} : { approvedAt: input.approvedAt }),
      ...(input.disconnectedAt === undefined ? {} : { disconnectedAt: input.disconnectedAt }),
      ...(input.leftAt === undefined ? {} : { leftAt: input.leftAt }),
    };
    await this.prisma.handoffParticipant.upsert({
      where: { sessionId_deviceId: { sessionId: input.sessionId, deviceId: input.deviceId } },
      create: {
        id: globalThis.crypto.randomUUID(),
        sessionId: input.sessionId,
        userId: input.userId ?? null,
        deviceId: input.deviceId,
        deviceLabel: input.deviceLabel,
        deviceType: input.deviceType ?? null,
        browser: input.browser ?? null,
        operatingSystem: input.operatingSystem ?? null,
        role: input.role,
        status: input.status,
        joinedAt: input.joinedAt,
        approvedAt: input.approvedAt ?? null,
        disconnectedAt: input.disconnectedAt ?? null,
        leftAt: input.leftAt ?? null,
      },
      update,
    });
    await this.refreshHandoffSessionCounts(input.sessionId);
  }

  public async recordHandoffActivity(input: RecordHandoffActivityInput): Promise<void> {
    await this.prisma.handoffActivity.create({
      data: {
        userId: input.userId ?? null,
        sessionId: input.sessionId,
        transferId: input.transferId ?? null,
        eventType: input.eventType,
        title: input.title,
        summary: input.summary ?? null,
        fileCount: input.fileCount ?? null,
        totalSize: input.totalSize === undefined ? null : BigInt(input.totalSize),
        sizeBucket: input.sizeBucket ?? null,
        deviceLabel: input.deviceLabel ?? null,
        peerLabel: input.peerLabel ?? null,
        createdAt: input.createdAt ?? new Date(),
      },
    });
  }

  public async recordTransferMetadata(input: RecordTransferMetadataInput): Promise<void> {
    const update = {
      status: input.status,
      ...(input.fileCount === undefined ? {} : { fileCount: input.fileCount }),
      ...(input.totalSize === undefined ? {} : { totalSize: BigInt(input.totalSize) }),
      ...(input.sizeBucket === undefined ? {} : { sizeBucket: input.sizeBucket }),
      ...(input.connectionType === undefined ? {} : { connectionType: input.connectionType }),
      ...(input.status === "started" ? { startedAt: input.occurredAt ?? new Date() } : {}),
      ...(input.status === "completed" ? { completedAt: input.occurredAt ?? new Date() } : {}),
      ...(input.status === "failed" || input.status === "interrupted"
        ? { failedAt: input.occurredAt ?? new Date() }
        : {}),
      ...(input.failureReason === undefined ? {} : { failureReason: input.failureReason }),
      ...(input.failureStage === undefined ? {} : { failureStage: input.failureStage }),
      ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    };
    await this.prisma.handoffTransfer.upsert({
      where: { id: input.transferId },
      create: {
        id: input.transferId,
        sessionId: input.sessionId,
        status: input.status,
        fileCount: input.fileCount ?? 0,
        totalSize: BigInt(input.totalSize ?? 0),
        sizeBucket: input.sizeBucket ?? null,
        connectionType: input.connectionType ?? null,
        startedAt: input.status === "started" ? (input.occurredAt ?? new Date()) : null,
        completedAt: input.status === "completed" ? (input.occurredAt ?? new Date()) : null,
        failedAt:
          input.status === "failed" || input.status === "interrupted"
            ? (input.occurredAt ?? new Date())
            : null,
        failureReason: input.failureReason ?? null,
        failureStage: input.failureStage ?? null,
        durationMs: input.durationMs ?? null,
      },
      update,
    });
    const aggregate = await this.prisma.handoffTransfer.aggregate({
      where: { sessionId: input.sessionId },
      _count: { _all: true },
      _sum: { fileCount: true, totalSize: true },
    });
    await this.prisma.handoffSession.updateMany({
      where: { id: input.sessionId },
      data: {
        transferCount: aggregate._count._all,
        fileCount: aggregate._sum.fileCount ?? 0,
        totalSize: aggregate._sum.totalSize ?? BigInt(0),
        ...(input.connectionType === undefined ? {} : { connectionType: input.connectionType }),
        ...(input.status === "completed" ? { success: true } : {}),
        ...(input.status === "failed" || input.status === "interrupted"
          ? { success: false, failureReason: input.failureReason ?? null }
          : {}),
      },
    });
  }

  public async getHandoffSessionOwner(sessionId: string): Promise<string | undefined> {
    const session = await this.prisma.handoffSession.findUnique({
      where: { id: sessionId },
      select: { ownerUserId: true },
    });
    return session?.ownerUserId ?? undefined;
  }

  public async listHandoffSessions(userId: string, limit = 50): Promise<HandoffSessionSummary[]> {
    const sessions = await this.prisma.handoffSession.findMany({
      where: {
        OR: [{ ownerUserId: userId }, { participants: { some: { userId } } }],
      },
      include: { participants: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    return sessions.map((session) => serializeHandoffSession(session, userId));
  }

  public async listRecentActivity(userId: string, limit = 20): Promise<HandoffActivitySummary[]> {
    const activity = await this.prisma.handoffActivity.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return activity.map(serializeHandoffActivity);
  }

  public async close(): Promise<void> {
    await this.prisma.$disconnect();
  }

  private async refreshHandoffSessionCounts(sessionId: string): Promise<void> {
    const participants = await this.prisma.handoffParticipant.findMany({ where: { sessionId } });
    await this.prisma.handoffSession.updateMany({
      where: { id: sessionId },
      data: {
        participantCount: participants.length,
        connectedDeviceCount: participants.filter(
          (participant) => participant.status === "connected",
        ).length,
      },
    });
  }
}

function serializeDevice(row: {
  id: string;
  userId: string;
  label: string;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  userAgent: string | null;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): AccountDevice {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    ...(row.browser === null ? {} : { browser: row.browser }),
    ...(row.os === null ? {} : { os: row.os }),
    ...(row.deviceType === null ? {} : { deviceType: row.deviceType }),
    ...(row.userAgent === null ? {} : { userAgent: row.userAgent }),
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeHandoffSession(
  row: {
    id: string;
    publicCode: string;
    type: string;
    tier: string;
    status: string;
    createdAt: Date;
    endedAt: Date | null;
    participantCount: number;
    connectedDeviceCount: number;
    transferCount: number;
    fileCount: number;
    totalSize: bigint;
    success: boolean | null;
    connectionType: string | null;
    endReason: string | null;
    failureReason: string | null;
    participants: Array<{ userId: string | null; deviceLabel: string }>;
  },
  userId: string,
): HandoffSessionSummary {
  const peer =
    row.participants.find((participant) => participant.userId !== userId) ?? row.participants[1];
  const durationMs =
    row.endedAt === null ? undefined : row.endedAt.getTime() - row.createdAt.getTime();
  return {
    id: row.id,
    code: row.publicCode,
    type: row.type === "receive" ? "receive" : "standard",
    tier: isSessionTier(row.tier) ? row.tier : "free",
    status: isHandoffSessionStatus(row.status) ? row.status : "waiting",
    createdAt: row.createdAt,
    participantCount: row.participantCount,
    connectedDeviceCount: row.connectedDeviceCount,
    deviceLabels: row.participants.map((participant) => participant.deviceLabel),
    transferCount: row.transferCount,
    fileCount: row.fileCount,
    totalSize: Number(row.totalSize),
    planTier: isSessionTier(row.tier) ? row.tier : "free",
    ...(row.endedAt === null ? {} : { endedAt: row.endedAt }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(peer?.deviceLabel === undefined ? {} : { peerLabel: peer.deviceLabel }),
    ...(row.success === null ? {} : { success: row.success }),
    ...(row.connectionType === "direct" || row.connectionType === "relay"
      ? { connectionType: row.connectionType }
      : {}),
    ...(row.endReason === null ? {} : { endReason: row.endReason }),
    ...(row.failureReason === null ? {} : { failureReason: row.failureReason }),
  };
}

function serializeHandoffActivity(row: {
  id: bigint;
  sessionId: string;
  transferId: string | null;
  eventType: string;
  title: string;
  summary: string | null;
  fileCount: number | null;
  totalSize: bigint | null;
  sizeBucket: string | null;
  deviceLabel: string | null;
  peerLabel: string | null;
  createdAt: Date;
}): HandoffActivitySummary {
  return {
    id: row.id.toString(),
    sessionId: row.sessionId,
    eventType: row.eventType,
    title: row.title,
    createdAt: row.createdAt,
    ...(row.transferId === null ? {} : { transferId: row.transferId }),
    ...(row.summary === null ? {} : { summary: row.summary }),
    ...(row.fileCount === null ? {} : { fileCount: row.fileCount }),
    ...(row.totalSize === null ? {} : { totalSize: Number(row.totalSize) }),
    ...(row.sizeBucket === null ? {} : { sizeBucket: row.sizeBucket }),
    ...(row.deviceLabel === null ? {} : { deviceLabel: row.deviceLabel }),
    ...(row.peerLabel === null ? {} : { peerLabel: row.peerLabel }),
  };
}

function serializeUser(row: {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  handle: string | null;
  defaultDeviceName: string | null;
  plan: string;
  provider: string;
  providerSubject: string;
  receiveMode: boolean;
  requireSenderName: boolean;
  allowSenderMessage: boolean;
  requireSenderMessage: boolean;
  createdAt: Date;
}): AccountUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    ...(row.avatarUrl === null ? {} : { avatarUrl: row.avatarUrl }),
    ...(row.handle === null ? {} : { handle: row.handle }),
    ...(row.defaultDeviceName === null ? {} : { defaultDeviceName: row.defaultDeviceName }),
    plan: isAccountPlan(row.plan) ? row.plan : "account",
    provider: row.provider === "google" ? "google" : "google",
    providerSubject: row.providerSubject,
    receiveMode: row.receiveMode,
    requireSenderName: row.requireSenderName,
    allowSenderMessage: row.allowSenderMessage,
    requireSenderMessage: row.requireSenderMessage,
    createdAt: row.createdAt,
  };
}

function isAccountPlan(value: string): value is AccountPlan {
  return value === "free" || value === "account" || value === "pro";
}

function isSessionTier(value: string): value is HandoffSessionSummary["tier"] {
  return value === "guest" || value === "free" || value === "pro";
}

function isHandoffSessionStatus(value: string): value is HandoffSessionStatus {
  return (
    value === "waiting" ||
    value === "connected" ||
    value === "transferring" ||
    value === "partially_connected" ||
    value === "reconnectable" ||
    value === "ended" ||
    value === "expired" ||
    value === "failed"
  );
}

function deviceKey(userId: string, deviceId: string): string {
  return `${userId}:${deviceId}`;
}

function participantKey(sessionId: string, deviceId: string): string {
  return `${sessionId}:${deviceId}`;
}

function sessionSortTime(session: { endedAt?: Date; createdAt: Date }): number {
  return (session.endedAt ?? session.createdAt).getTime();
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
