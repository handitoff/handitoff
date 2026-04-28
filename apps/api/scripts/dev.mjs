import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { mergeDotEnv } from "../../../scripts/env.mjs";

let server;
let builtOnce = false;
const rootDir = dirname(fileURLToPath(new URL("../../../package.json", import.meta.url)));
const env = mergeDotEnv(join(rootDir, ".env"));
const tscCommand =
  process.platform === "win32"
    ? ["cmd.exe", ["/d", "/s", "/c", "npx tsc -b --watch --preserveWatchOutput"]]
    : ["npx", ["tsc", "-b", "--watch", "--preserveWatchOutput"]];
const node = process.execPath;

const tsc = spawn(tscCommand[0], tscCommand[1], {
  stdio: ["ignore", "pipe", "pipe"],
  env,
});

tsc.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (!builtOnce && text.includes("Found 0 errors. Watching for file changes.")) {
    builtOnce = true;
    startServer();
  }
});

tsc.stderr.on("data", (chunk) => process.stderr.write(chunk));
tsc.on("exit", (code) => {
  stopServer();
  process.exit(code ?? 0);
});

function startServer() {
  server = spawn(node, ["--watch", "dist/server.js"], {
    stdio: "inherit",
    env,
  });
}

function stopServer() {
  if (server !== undefined && !server.killed) {
    server.kill();
  }
}

process.on("SIGINT", () => {
  stopServer();
  tsc.kill();
});

process.on("SIGTERM", () => {
  stopServer();
  tsc.kill();
});
