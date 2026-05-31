import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadDotEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "../../.env") });

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://handitoff:handitoff@localhost:5432/handitoff";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
