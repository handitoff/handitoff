import { existsSync, readFileSync } from "node:fs";

export function readDotEnv(path) {
  if (!existsSync(path)) {
    return {};
  }

  const env = {};
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
    const value = line.slice(equalsIndex + 1).trim();
    env[key] = stripOptionalQuotes(value);
  }

  return env;
}

export function mergeDotEnv(path, baseEnv = process.env) {
  return {
    ...readDotEnv(path),
    ...baseEnv,
  };
}

function stripOptionalQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
