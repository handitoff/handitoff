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

  public async close(): Promise<void> {
    await this.prisma.$disconnect();
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

function deviceKey(userId: string, deviceId: string): string {
  return `${userId}:${deviceId}`;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
