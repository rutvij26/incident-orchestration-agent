import { ConfigSchema } from "./configSchema.js";
import type { Config } from "./configSchema.js";
import { getConfigFromLoader, isLoaderActive } from "./configLoader.js";

export type { Config } from "./configSchema.js";

let cachedConfig: Config | null = null;

/** Gets the configuration. Delegates to the DB-backed loader when active. */
export function getConfig(): Config {
  if (isLoaderActive()) {
    return getConfigFromLoader();
  }
  if (cachedConfig) {
    return cachedConfig;
  }
  const parsed = ConfigSchema.parse(process.env);
  cachedConfig = parsed;
  return parsed;
}

/** @internal — for tests only */
export function resetConfigCache(): void {
  cachedConfig = null;
}
