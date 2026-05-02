import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync, createReadStream } from "node:fs";
import { dirname, join, extname } from "node:path";
import type { Socket } from "node:net";
import { fileURLToPath } from "node:url";

import type { PublicIceServer } from "@handitoff/config";
import { loadServerConfig } from "@handitoff/config";
import { issueTurnCredential } from "@handitoff/turn";
import { DEFAULT_HOSTED_ABUSE_LIMITS } from "@handitoff/abuse";
import { ConsoleAnalyticsSink, NoopAnalyticsSink } from "@handitoff/analytics";

import { createApiApp } from "./app.js";
import { RedisTcpClient } from "./redis-client.js";
import { SignalingHub } from "./signaling.js";
import { InMemorySessionStore, RedisSessionStore } from "./session-store.js";
import { handleWebSocketUpgrade } from "./websocket.js";

export function createNodeServer() {
  loadRepoDotEnv();
  const config = loadServerConfig();

  const store =
    config.redisUrl === undefined
      ? new InMemorySessionStore()
      : new RedisSessionStore(new RedisTcpClient(config.redisUrl));

  const analytics =
    process.env.HANDITOFF_ANALYTICS_ENABLED === "true"
      ? new ConsoleAnalyticsSink()
      : new NoopAnalyticsSink();

  const abuseLimits =
    process.env.HANDITOFF_ABUSE_ENABLED === "true" ? DEFAULT_HOSTED_ABUSE_LIMITS : undefined;

  const getIceServers = config.turn ? buildTurnIceServersGetter(config.turn) : undefined;

  const hub = new SignalingHub({ config, store, analytics });

  const appOptions: Parameters<typeof createApiApp>[0] = {
    config,
    store,
    analytics,
    onSessionExpired: (sessionId) => hub.expireSession(sessionId),
  };
  if (abuseLimits !== undefined) {
    appOptions.abuseLimits = abuseLimits;
  }
  if (getIceServers !== undefined) {
    appOptions.getIceServers = getIceServers;
  }
  const handler = createApiApp(appOptions);

  const webDir = resolveWebDir();

  const server = createServer((incoming, outgoing) => {
    void (async () => {
      const url = incoming.url ?? "/";

      if (!url.startsWith("/api") && !url.startsWith("/ws") && webDir !== undefined) {
        serveStatic(url, webDir, outgoing);
        return;
      }

      const request = toRequest(incoming);
      const response = await handler(request);

      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => outgoing.setHeader(key, value));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    })();
  });

  server.on("upgrade", (request, socket) => {
    if (!handleWebSocketUpgrade(hub, request, socket as Socket)) {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
    }
  });

  const heartbeatSweep = setInterval(() => hub.sweepHeartbeats(), 10_000);
  heartbeatSweep.unref();

  return server;
}

function buildTurnIceServersGetter(turn: {
  secret: string;
  urls: string[];
  credentialTtlSeconds: number;
}): () => PublicIceServer[] {
  return function getIceServers(): PublicIceServer[] {
    const turnServer = issueTurnCredential({
      secret: turn.secret,
      urls: turn.urls,
      ttlSeconds: turn.credentialTtlSeconds,
    });
    return [{ urls: "stun:stun.l.google.com:19302" }, turnServer as PublicIceServer];
  };
}

function resolveWebDir(): string | undefined {
  const explicit = process.env.HANDITOFF_WEB_DIR;
  if (explicit !== undefined && explicit.trim() !== "") {
    return explicit.trim();
  }
  const candidate = join(dirname(fileURLToPath(import.meta.url)), "../../web/build/client");
  return existsSync(candidate) ? candidate : undefined;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
};

function serveStatic(url: string, webDir: string, outgoing: ServerResponse): void {
  const cleanPath = url.split("?")[0] ?? "/";
  const filePath = join(webDir, cleanPath === "/" ? "index.html" : cleanPath);

  try {
    const stat = statSync(filePath);
    if (stat.isFile()) {
      const mime = MIME[extname(filePath)] ?? "application/octet-stream";
      const isImmutable = cleanPath.startsWith("/assets/");
      outgoing.setHeader("content-type", mime);
      outgoing.setHeader(
        "cache-control",
        isImmutable ? "public, max-age=31536000, immutable" : "no-cache",
      );
      outgoing.statusCode = 200;
      createReadStream(filePath).pipe(outgoing);
      return;
    }
  } catch {
    // file not found — fall through to SPA fallback
  }

  const indexPath = join(webDir, "index.html");
  try {
    const html = readFileSync(indexPath, "utf8");
    outgoing.setHeader("content-type", "text/html; charset=utf-8");
    outgoing.setHeader("cache-control", "no-cache");
    outgoing.statusCode = 200;
    outgoing.end(html);
  } catch {
    outgoing.statusCode = 404;
    outgoing.end("Not found");
  }
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
