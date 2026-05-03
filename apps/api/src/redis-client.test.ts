import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { RedisTcpClient } from "./redis-client.js";

describe("RedisTcpClient", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error === undefined ? resolve() : reject(error))),
          ),
      ),
    );
    servers.length = 0;
  });

  it("authenticates with username and password from Redis URLs", async () => {
    const receivedCommands: string[][] = [];
    const server = createServer((socket) => {
      let buffer = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (true) {
          if (buffer.length === 0) {
            return;
          }
          const parsed = parseCommand(buffer);
          if (parsed === undefined) {
            return;
          }
          receivedCommands.push(parsed.command);
          buffer = buffer.subarray(parsed.bytesRead);
          socket.write(receivedCommands.length === 1 ? "+OK\r\n" : "$5\r\nvalue\r\n");
        }
      });
    });
    servers.push(server);
    const port = await listen(server);
    const client = new RedisTcpClient(`redis://default:secret@127.0.0.1:${port}`);

    await expect(client.get("key")).resolves.toBe("value");
    expect(receivedCommands).toEqual([
      ["AUTH", "default", "secret"],
      ["GET", "key"],
    ]);
  });
});

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        throw new Error("Expected TCP server address.");
      }
      resolve(address.port);
    });
  });
}

function parseCommand(buffer: Buffer): { command: string[]; bytesRead: number } | undefined {
  let offset = 0;
  if (buffer[offset] !== 42) {
    throw new Error("Expected RESP array.");
  }
  const countLine = readLine(buffer, 1);
  if (countLine === undefined) {
    return undefined;
  }
  const count = Number(countLine.value);
  offset = countLine.next;
  const command: string[] = [];

  for (let index = 0; index < count; index += 1) {
    if (buffer[offset] !== 36) {
      throw new Error("Expected RESP bulk string.");
    }
    const lengthLine = readLine(buffer, offset + 1);
    if (lengthLine === undefined) {
      return undefined;
    }
    const length = Number(lengthLine.value);
    const start = lengthLine.next;
    const end = start + length;
    if (buffer.length < end + 2) {
      return undefined;
    }
    command.push(buffer.toString("utf8", start, end));
    offset = end + 2;
  }

  return { command, bytesRead: offset };
}

function readLine(buffer: Buffer, start: number): { value: string; next: number } | undefined {
  const end = buffer.indexOf("\r\n", start, "utf8");
  if (end === -1) {
    return undefined;
  }
  return { value: buffer.toString("utf8", start, end), next: end + 2 };
}
