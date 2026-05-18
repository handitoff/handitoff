import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  cacheDir: resolve(tmpdir(), "handitoff-web-vite-cache"),
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  resolve: {
    alias: {
      "@handitoff/analytics": resolve(__dirname, "../../packages/analytics/src/index.ts"),
      "@handitoff/config": resolve(__dirname, "../../packages/config/src/index.ts"),
      "@handitoff/crypto": resolve(__dirname, "../../packages/crypto/src/index.ts"),
      "@handitoff/protocol": resolve(__dirname, "../../packages/protocol/src/index.ts"),
      "@handitoff/transfer": resolve(__dirname, "../../packages/transfer/src/index.ts"),
    },
    dedupe: ["react", "react-dom", "react-router"],
  },
});
