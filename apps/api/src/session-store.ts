import {
  generatePublicCode,
  type Device,
  type Session,
  type SessionStatus,
} from "@handitoff/protocol";

export type SessionDecision = "approved" | "rejected";

export type StoredSession = Session & {
  hostDevice: Device;
  guestDevice?: Device;
  hostIpKey: string;
  endedAt?: number;
  endReason?: string;
  lastDecision?: {
    decision: SessionDecision;
    deviceId: string;
    decidedAt: number;
  };
};

export type CreateSessionInput = {
  hostDeviceId: string;
  hostLabel: string;
  hostUserAgent?: string;
  hostIpKey: string;
  ttlSeconds: number;
  now?: number;
};

export type AttachGuestInput = {
  sessionId: string;
  guestDeviceId: string;
  guestLabel: string;
  guestUserAgent?: string;
  ttlSeconds: number;
  now?: number;
};

export type SessionStore = {
  create(input: CreateSessionInput): Promise<StoredSession>;
  getByPublicCode(
    publicCode: string,
    options?: { includeExpired?: boolean },
  ): Promise<StoredSession | undefined>;
  getById(
    sessionId: string,
    options?: { includeExpired?: boolean },
  ): Promise<StoredSession | undefined>;
  updateStatus(
    sessionId: string,
    status: SessionStatus,
    ttlSeconds?: number,
  ): Promise<StoredSession | undefined>;
  attachGuest(input: AttachGuestInput): Promise<StoredSession | undefined>;
  recordApproval(sessionId: string, deviceId: string): Promise<StoredSession | undefined>;
  recordRejection(sessionId: string, deviceId: string): Promise<StoredSession | undefined>;
  heartbeat(
    sessionId: string,
    deviceId: string,
    ttlSeconds?: number,
  ): Promise<StoredSession | undefined>;
  expire(sessionId: string): Promise<StoredSession | undefined>;
  end(sessionId: string, deviceId: string, reason?: string): Promise<StoredSession | undefined>;
  countActiveByIp(ipKey: string): Promise<number>;
  sweepExpired(now?: number): Promise<StoredSession[]>;
};

type CodeGenerator = () => string;

export class InMemorySessionStore implements SessionStore {
  private readonly sessionsById = new Map<string, StoredSession>();
  private readonly idsByPublicCode = new Map<string, string>();
  private readonly codeGenerator: CodeGenerator;
  private readonly idGenerator: () => string;
  private readonly now: () => number;

  public constructor(
    options: { codeGenerator?: CodeGenerator; idGenerator?: () => string; now?: () => number } = {},
  ) {
    this.codeGenerator = options.codeGenerator ?? generatePublicCode;
    this.idGenerator = options.idGenerator ?? randomId;
    this.now = options.now ?? Date.now;
  }

  public async create(input: CreateSessionInput): Promise<StoredSession> {
    await this.sweepExpired(input.now);
    const now = input.now ?? this.now();
    const publicCode = this.generateUniquePublicCode();
    const session: StoredSession = {
      id: this.idGenerator(),
      publicCode,
      createdAt: now,
      expiresAt: now + input.ttlSeconds * 1000,
      status: "waiting",
      hostDeviceId: input.hostDeviceId,
      hostIpKey: input.hostIpKey,
      hostDevice: {
        id: input.hostDeviceId,
        role: "host",
        label: input.hostLabel,
        connectedAt: now,
        lastSeenAt: now,
        ...(input.hostUserAgent === undefined ? {} : { userAgent: input.hostUserAgent }),
      },
    };

    this.sessionsById.set(session.id, session);
    this.idsByPublicCode.set(publicCode, session.id);
    return cloneSession(session);
  }

  public async getByPublicCode(
    publicCode: string,
    options: { includeExpired?: boolean } = {},
  ): Promise<StoredSession | undefined> {
    await this.sweepExpired();
    const sessionId = this.idsByPublicCode.get(publicCode);
    if (sessionId === undefined) {
      return undefined;
    }
    return this.getById(sessionId, options);
  }

  public async getById(
    sessionId: string,
    options: { includeExpired?: boolean } = {},
  ): Promise<StoredSession | undefined> {
    await this.sweepExpired();
    const session = this.sessionsById.get(sessionId);
    if (
      session === undefined ||
      (session.status === "expired" && options.includeExpired !== true)
    ) {
      return undefined;
    }
    return cloneSession(session);
  }

  public async updateStatus(
    sessionId: string,
    status: SessionStatus,
    ttlSeconds?: number,
  ): Promise<StoredSession | undefined> {
    const session = this.sessionsById.get(sessionId);
    if (session === undefined) {
      return undefined;
    }
    session.status = status;
    if (ttlSeconds !== undefined) {
      session.expiresAt = this.now() + ttlSeconds * 1000;
    }
    return cloneSession(session);
  }

  public async attachGuest(input: AttachGuestInput): Promise<StoredSession | undefined> {
    const session = this.sessionsById.get(input.sessionId);
    if (session === undefined || session.status === "ended" || session.status === "expired") {
      return undefined;
    }

    const now = input.now ?? this.now();
    session.guestDeviceId = input.guestDeviceId;
    session.status = "connected";
    session.expiresAt = now + input.ttlSeconds * 1000;
    session.guestDevice = {
      id: input.guestDeviceId,
      role: "guest",
      label: input.guestLabel,
      connectedAt: now,
      lastSeenAt: now,
      ...(input.guestUserAgent === undefined ? {} : { userAgent: input.guestUserAgent }),
    };
    return cloneSession(session);
  }

  public async recordApproval(
    sessionId: string,
    deviceId: string,
  ): Promise<StoredSession | undefined> {
    return this.recordDecision(sessionId, deviceId, "approved");
  }

  public async recordRejection(
    sessionId: string,
    deviceId: string,
  ): Promise<StoredSession | undefined> {
    return this.recordDecision(sessionId, deviceId, "rejected");
  }

  public async heartbeat(
    sessionId: string,
    deviceId: string,
    ttlSeconds?: number,
  ): Promise<StoredSession | undefined> {
    const session = this.sessionsById.get(sessionId);
    if (session === undefined || session.status === "ended" || session.status === "expired") {
      return undefined;
    }

    const now = this.now();
    if (session.hostDevice.id === deviceId) {
      session.hostDevice.lastSeenAt = now;
    } else if (session.guestDevice?.id === deviceId) {
      session.guestDevice.lastSeenAt = now;
    } else {
      return undefined;
    }

    if (ttlSeconds !== undefined) {
      session.expiresAt = now + ttlSeconds * 1000;
    }
    return cloneSession(session);
  }

  public async expire(sessionId: string): Promise<StoredSession | undefined> {
    const session = this.sessionsById.get(sessionId);
    if (session === undefined || session.status === "ended") {
      return undefined;
    }
    session.status = "expired";
    return cloneSession(session);
  }

  public async end(
    sessionId: string,
    deviceId: string,
    reason = "manual",
  ): Promise<StoredSession | undefined> {
    const session = this.sessionsById.get(sessionId);
    if (session === undefined || !canControlSession(session, deviceId)) {
      return undefined;
    }
    session.status = "ended";
    session.endedAt = this.now();
    session.endReason = reason;
    return cloneSession(session);
  }

  public async countActiveByIp(ipKey: string): Promise<number> {
    await this.sweepExpired();
    let count = 0;
    for (const session of this.sessionsById.values()) {
      if (
        session.hostIpKey === ipKey &&
        session.status !== "ended" &&
        session.status !== "expired"
      ) {
        count += 1;
      }
    }
    return count;
  }

  public async sweepExpired(now = this.now()): Promise<StoredSession[]> {
    const expired: StoredSession[] = [];
    for (const session of this.sessionsById.values()) {
      if (session.status !== "ended" && session.status !== "expired" && session.expiresAt <= now) {
        session.status = "expired";
        expired.push(cloneSession(session));
      }
    }
    return expired;
  }

  private async recordDecision(
    sessionId: string,
    deviceId: string,
    decision: SessionDecision,
  ): Promise<StoredSession | undefined> {
    const session = this.sessionsById.get(sessionId);
    if (session === undefined || !canControlSession(session, deviceId)) {
      return undefined;
    }
    session.lastDecision = { decision, deviceId, decidedAt: this.now() };
    session.status = decision === "approved" ? "connected" : "ended";
    return cloneSession(session);
  }

  private generateUniquePublicCode(): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = this.codeGenerator();
      if (!this.idsByPublicCode.has(code)) {
        return code;
      }
    }
    throw new Error("Unable to allocate a unique public session code.");
  }
}

export type RedisClientLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: "EX", ttlSeconds?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
};

export class RedisSessionStore implements SessionStore {
  private readonly keyPrefix: string;
  private readonly client: RedisClientLike;
  private readonly codeGenerator: CodeGenerator;
  private readonly idGenerator: () => string;
  private readonly now: () => number;

  public constructor(
    client: RedisClientLike,
    options: {
      keyPrefix?: string;
      codeGenerator?: CodeGenerator;
      idGenerator?: () => string;
      now?: () => number;
    } = {},
  ) {
    this.client = client;
    this.keyPrefix = options.keyPrefix ?? "handitoff";
    this.codeGenerator = options.codeGenerator ?? generatePublicCode;
    this.idGenerator = options.idGenerator ?? randomId;
    this.now = options.now ?? Date.now;
  }

  public async create(input: CreateSessionInput): Promise<StoredSession> {
    const now = input.now ?? this.now();
    const publicCode = await this.generateUniquePublicCode();
    const session: StoredSession = {
      id: this.idGenerator(),
      publicCode,
      createdAt: now,
      expiresAt: now + input.ttlSeconds * 1000,
      status: "waiting",
      hostDeviceId: input.hostDeviceId,
      hostIpKey: input.hostIpKey,
      hostDevice: {
        id: input.hostDeviceId,
        role: "host",
        label: input.hostLabel,
        connectedAt: now,
        lastSeenAt: now,
        ...(input.hostUserAgent === undefined ? {} : { userAgent: input.hostUserAgent }),
      },
    };
    await this.persist(session, input.ttlSeconds);
    return cloneSession(session);
  }

  public async getByPublicCode(
    publicCode: string,
    options: { includeExpired?: boolean } = {},
  ): Promise<StoredSession | undefined> {
    const sessionId = await this.client.get(this.publicCodeKey(publicCode));
    if (sessionId === null) {
      return undefined;
    }
    return this.getById(sessionId, options);
  }

  public async getById(
    sessionId: string,
    options: { includeExpired?: boolean } = {},
  ): Promise<StoredSession | undefined> {
    const session = await this.read(sessionId);
    if (
      session === undefined ||
      (session.status === "expired" && options.includeExpired !== true)
    ) {
      return undefined;
    }
    return session;
  }

  public async updateStatus(
    sessionId: string,
    status: SessionStatus,
    ttlSeconds?: number,
  ): Promise<StoredSession | undefined> {
    const session = await this.read(sessionId);
    if (session === undefined) {
      return undefined;
    }
    session.status = status;
    if (ttlSeconds !== undefined) {
      session.expiresAt = this.now() + ttlSeconds * 1000;
    }
    await this.persist(session, ttlSeconds);
    return session;
  }

  public async attachGuest(input: AttachGuestInput): Promise<StoredSession | undefined> {
    const session = await this.read(input.sessionId);
    if (session === undefined || session.status === "ended" || session.status === "expired") {
      return undefined;
    }
    const now = input.now ?? this.now();
    session.guestDeviceId = input.guestDeviceId;
    session.status = "connected";
    session.expiresAt = now + input.ttlSeconds * 1000;
    session.guestDevice = {
      id: input.guestDeviceId,
      role: "guest",
      label: input.guestLabel,
      connectedAt: now,
      lastSeenAt: now,
      ...(input.guestUserAgent === undefined ? {} : { userAgent: input.guestUserAgent }),
    };
    await this.persist(session, input.ttlSeconds);
    return session;
  }

  public async recordApproval(
    sessionId: string,
    deviceId: string,
  ): Promise<StoredSession | undefined> {
    return this.recordDecision(sessionId, deviceId, "approved");
  }

  public async recordRejection(
    sessionId: string,
    deviceId: string,
  ): Promise<StoredSession | undefined> {
    return this.recordDecision(sessionId, deviceId, "rejected");
  }

  public async heartbeat(
    sessionId: string,
    deviceId: string,
    ttlSeconds?: number,
  ): Promise<StoredSession | undefined> {
    const session = await this.read(sessionId);
    if (session === undefined || session.status === "ended" || session.status === "expired") {
      return undefined;
    }
    const now = this.now();
    if (session.hostDevice.id === deviceId) {
      session.hostDevice.lastSeenAt = now;
    } else if (session.guestDevice?.id === deviceId) {
      session.guestDevice.lastSeenAt = now;
    } else {
      return undefined;
    }
    if (ttlSeconds !== undefined) {
      session.expiresAt = now + ttlSeconds * 1000;
    }
    await this.persist(session, ttlSeconds);
    return session;
  }

  public async expire(sessionId: string): Promise<StoredSession | undefined> {
    const session = await this.read(sessionId);
    if (session === undefined || session.status === "ended") {
      return undefined;
    }
    session.status = "expired";
    await this.persist(session, 60);
    return session;
  }

  public async end(
    sessionId: string,
    deviceId: string,
    reason = "manual",
  ): Promise<StoredSession | undefined> {
    const session = await this.read(sessionId);
    if (session === undefined || !canControlSession(session, deviceId)) {
      return undefined;
    }
    session.status = "ended";
    session.endedAt = this.now();
    session.endReason = reason;
    await this.persist(session, 60);
    return session;
  }

  public async countActiveByIp(ipKey: string): Promise<number> {
    const sessions = await this.readAll();
    return sessions.filter(
      (session) =>
        session.hostIpKey === ipKey && session.status !== "ended" && session.status !== "expired",
    ).length;
  }

  public async sweepExpired(now = this.now()): Promise<StoredSession[]> {
    const expired: StoredSession[] = [];
    for (const session of await this.readAll()) {
      if (session.status !== "ended" && session.status !== "expired" && session.expiresAt <= now) {
        session.status = "expired";
        await this.persist(session, 60);
        expired.push(session);
      }
    }
    return expired;
  }

  private async recordDecision(
    sessionId: string,
    deviceId: string,
    decision: SessionDecision,
  ): Promise<StoredSession | undefined> {
    const session = await this.read(sessionId);
    if (session === undefined || !canControlSession(session, deviceId)) {
      return undefined;
    }
    session.lastDecision = { decision, deviceId, decidedAt: this.now() };
    session.status = decision === "approved" ? "connected" : "ended";
    await this.persist(session);
    return session;
  }

  private async generateUniquePublicCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = this.codeGenerator();
      if ((await this.client.get(this.publicCodeKey(code))) === null) {
        return code;
      }
    }
    throw new Error("Unable to allocate a unique public session code.");
  }

  private async read(sessionId: string): Promise<StoredSession | undefined> {
    const value = await this.client.get(this.sessionKey(sessionId));
    return value === null ? undefined : (JSON.parse(value) as StoredSession);
  }

  private async readAll(): Promise<StoredSession[]> {
    const keys = await this.client.keys(this.sessionKey("*"));
    const sessions = await Promise.all(keys.map((key) => this.client.get(key)));
    return sessions
      .filter((session): session is string => session !== null)
      .map((session) => JSON.parse(session) as StoredSession);
  }

  private async persist(session: StoredSession, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? Math.max(1, Math.ceil((session.expiresAt - this.now()) / 1000));
    await this.client.set(this.sessionKey(session.id), JSON.stringify(session), "EX", ttl);
    await this.client.set(this.publicCodeKey(session.publicCode), session.id, "EX", ttl);
  }

  private sessionKey(sessionId: string): string {
    return `${this.keyPrefix}:session:${sessionId}`;
  }

  private publicCodeKey(publicCode: string): string {
    return `${this.keyPrefix}:session-code:${publicCode}`;
  }
}

export function toPublicSession(session: StoredSession) {
  return {
    publicCode: session.publicCode,
    status: session.status,
    expiresAt: session.expiresAt,
  };
}

export function canControlSession(session: StoredSession, deviceId: string): boolean {
  return session.hostDevice.id === deviceId || session.guestDevice?.id === deviceId;
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

function cloneSession(session: StoredSession): StoredSession {
  return JSON.parse(JSON.stringify(session)) as StoredSession;
}
