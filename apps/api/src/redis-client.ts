import { Socket } from "node:net";

import type { RedisClientLike } from "./session-store.js";

type RedisReply = string | number | null | RedisReply[];

export class RedisTcpClient implements RedisClientLike {
  private readonly url: URL;

  public constructor(redisUrl: string) {
    this.url = new URL(redisUrl);
  }

  public async get(key: string): Promise<string | null> {
    const reply = await this.command(["GET", key]);
    if (reply !== null && typeof reply !== "string") {
      throw new Error("Unexpected Redis GET reply.");
    }
    return reply;
  }

  public async set(key: string, value: string, mode?: "EX", ttlSeconds?: number): Promise<unknown> {
    const command =
      mode === undefined ? ["SET", key, value] : ["SET", key, value, mode, ttlSeconds];
    return this.command(command.map(String));
  }

  public async del(key: string): Promise<unknown> {
    return this.command(["DEL", key]);
  }

  public async keys(pattern: string): Promise<string[]> {
    const reply = await this.command(["KEYS", pattern]);
    if (!Array.isArray(reply) || !reply.every((item) => typeof item === "string")) {
      throw new Error("Unexpected Redis KEYS reply.");
    }
    return reply;
  }

  private command(parts: string[]): Promise<RedisReply> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      let settled = false;

      const fail = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        reject(error);
      };

      socket.on("data", (chunk) => {
        chunks.push(chunk);
        try {
          const parser = new RedisParser(Buffer.concat(chunks));
          const reply = parser.parse();
          if (!parser.done) {
            return;
          }
          settled = true;
          socket.end();
          resolve(reply);
        } catch (error) {
          if (error instanceof IncompleteRedisReplyError) {
            return;
          }
          fail(error instanceof Error ? error : new Error("Invalid Redis reply."));
        }
      });

      socket.on("error", fail);
      socket.on("connect", () => socket.write(encodeCommand(parts)));
      socket.connect({
        host: this.url.hostname,
        port: Number(this.url.port || 6379),
      });
    });
  }
}

function encodeCommand(parts: string[]): Buffer {
  return Buffer.from(
    `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`,
    "utf8",
  );
}

class RedisParser {
  private offset = 0;

  public constructor(private readonly buffer: Buffer) {}

  public get done(): boolean {
    return this.offset === this.buffer.length;
  }

  public parse(): RedisReply {
    return this.parseValue();
  }

  private parseValue(): RedisReply {
    const prefix = this.readByte();
    if (prefix === "+") {
      return this.readLine();
    }
    if (prefix === "-") {
      throw new Error(this.readLine());
    }
    if (prefix === ":") {
      return Number(this.readLine());
    }
    if (prefix === "$") {
      return this.readBulkString();
    }
    if (prefix === "*") {
      return this.readArray();
    }
    throw new Error("Unsupported Redis reply type.");
  }

  private readBulkString(): string | null {
    const length = Number(this.readLine());
    if (length === -1) {
      return null;
    }
    this.require(length + 2);
    const value = this.buffer.toString("utf8", this.offset, this.offset + length);
    this.offset += length;
    this.readCrlf();
    return value;
  }

  private readArray(): RedisReply[] {
    const length = Number(this.readLine());
    if (length < 0) {
      return [];
    }
    const values: RedisReply[] = [];
    for (let index = 0; index < length; index += 1) {
      values.push(this.parseValue());
    }
    return values;
  }

  private readByte(): string {
    this.require(1);
    const value = this.buffer.toString("utf8", this.offset, this.offset + 1);
    this.offset += 1;
    return value;
  }

  private readLine(): string {
    const end = this.buffer.indexOf("\r\n", this.offset, "utf8");
    if (end === -1) {
      throw new IncompleteRedisReplyError();
    }
    const value = this.buffer.toString("utf8", this.offset, end);
    this.offset = end + 2;
    return value;
  }

  private readCrlf(): void {
    this.require(2);
    if (this.buffer[this.offset] !== 13 || this.buffer[this.offset + 1] !== 10) {
      throw new Error("Invalid Redis reply terminator.");
    }
    this.offset += 2;
  }

  private require(bytes: number): void {
    if (this.offset + bytes > this.buffer.length) {
      throw new IncompleteRedisReplyError();
    }
  }
}

class IncompleteRedisReplyError extends Error {
  public constructor() {
    super("Incomplete Redis reply.");
  }
}
