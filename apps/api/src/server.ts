import { createServer, type IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";

import { loadServerConfig } from "@handitoff/config";

import { createApiApp } from "./app.js";

export function createNodeServer() {
  const handler = createApiApp({ config: loadServerConfig() });

  return createServer(async (incoming, outgoing) => {
    const request = toRequest(incoming);
    const response = await handler(request);

    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
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
