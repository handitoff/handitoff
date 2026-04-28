import { createServer, type IncomingMessage } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadServerConfig } from "@handitoff/config";

import { createApiApp } from "./app.js";
import { SignalingHub } from "./signaling.js";
import { InMemorySessionStore } from "./session-store.js";
import { handleWebSocketUpgrade } from "./websocket.js";

export function createNodeServer() {
  loadRepoDotEnv();
  const config = loadServerConfig();
  const store = new InMemorySessionStore();
  const hub = new SignalingHub({ config, store });
  const handler = createApiApp({
    config,
    store,
    onSessionExpired: (sessionId) => hub.expireSession(sessionId),
  });

  const server = createServer(async (incoming, outgoing) => {
    const request = toRequest(incoming);
    const response = await handler(request);

    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });

  server.on("upgrade", (request, socket) => {
    if (!handleWebSocketUpgrade(hub, request, socket as import("node:net").Socket)) {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
    }
  });

  const heartbeatSweep = setInterval(() => hub.sweepHeartbeats(), 10_000);
  heartbeatSweep.unref();

  return server;
}

function loadRepoDotEnv(): void {
  const path = join(dirname(fileURLToPath(import.meta.url)), "../../../.env");
  if (!existsSync(path)) {
    return;
  }

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (process.env[key] !== undefined) {
      continue;
    }

    const value = line.slice(equalsIndex + 1).trim();
    process.env[key] = stripOptionalQuotes(value);
  }
}

function stripOptionalQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function toRequest(incoming: IncomingMessage): Request {
  const host = incoming.headers.host ?? "localhost";
  const url = `http://${host}${incoming.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming.headers)) {
    if (value === undefined) {
      continue;
    }
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: incoming.method ?? "GET",
    headers,
  };

  if (incoming.method !== "GET" && incoming.method !== "HEAD") {
    init.body = incoming as unknown as BodyInit;
    init.duplex = "half";
  }

  return new Request(url, init);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  createNodeServer().listen(port, () => {
    console.info({ at: "api_listen", port });
  });
}
