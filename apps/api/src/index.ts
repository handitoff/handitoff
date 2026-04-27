import { loadServerConfig } from "@handitoff/config";

export function getApiRuntimeConfig() {
  return loadServerConfig();
}
