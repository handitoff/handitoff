import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { mergeDotEnv } from "./env.mjs";

const rootDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const baseEnv = mergeDotEnv(join(rootDir, ".env"));
const host = baseEnv.HANDITOFF_LAN_HOST ?? findLanAddress();

if (host === undefined) {
  console.error("Set HANDITOFF_LAN_HOST to your PC LAN IP, for example 192.168.1.50.");
  process.exit(1);
}

const env = {
  ...baseEnv,
  HANDITOFF_LAN_HOST: host,
  HANDITOFF_APP_URL: baseEnv.HANDITOFF_APP_URL ?? `http://${host}:5173`,
  HANDITOFF_API_URL: baseEnv.HANDITOFF_API_URL ?? `http://${host}:8787`,
  HANDITOFF_WS_URL: baseEnv.HANDITOFF_WS_URL ?? `ws://${host}:8787/ws`,
};
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

console.log(`handitoff.io LAN dev`);
console.log(`Web: ${env.HANDITOFF_APP_URL}`);
console.log(`API: ${env.HANDITOFF_API_URL}`);
console.log(`WS:  ${env.HANDITOFF_WS_URL}`);

if (process.argv.includes("--help")) {
  console.log("");
  console.log("Usage: npm run dev:lan");
  console.log("Set HANDITOFF_LAN_HOST in .env or your shell to force a specific LAN IP.");
  process.exit(0);
}

const children = [
  spawn(npm, ["run", "dev", "-w", "@handitoff/web", "--", "--host", "0.0.0.0"], {
    cwd: rootDir,
    env,
    stdio: "inherit",
  }),
  spawn(npm, ["run", "dev", "-w", "@handitoff/api"], {
    cwd: rootDir,
    env,
    stdio: "inherit",
  }),
];

for (const child of children) {
  child.on("exit", (code) => {
    for (const other of children) {
      if (other !== child && !other.killed) {
        other.kill();
      }
    }
    process.exit(code ?? 0);
  });
}

process.on("SIGINT", () => {
  for (const child of children) {
    child.kill();
  }
});

function findLanAddress() {
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  return undefined;
}
