import { spawn } from "node:child_process";

let server;
let builtOnce = false;

const tsc = spawn("npx", ["tsc", "-b", "--watch", "--preserveWatchOutput"], {
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
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
  server = spawn("node", ["--watch", "dist/server.js"], {
    shell: true,
    stdio: "inherit",
    env: process.env,
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
