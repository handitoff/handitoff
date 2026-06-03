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

export interface AccountStore {
  upsertOAuthUser(input: UpsertOAuthUserInput): Promise<AccountUser>;
  createSession(userId: string, expiresAt: Date): Promise<string>;
  getUserBySession(sessionId: string, now?: Date): Promise<AccountUser | undefined>;
  deleteSession(sessionId: string): Promise<void>;
  updateAccount(userId: string, input: UpdateAccountInput): Promise<AccountUser>;
  updateReceiveSettings(userId: string, input: UpdateReceiveSettingsInput): Promise<AccountUser>;
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

  public async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
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

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
