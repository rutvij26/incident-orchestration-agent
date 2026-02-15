import { logger } from "../lib/logger.js";
import { refreshRepoCache } from "./repoCache.js";

async function run(): Promise<void> {
  const path = await refreshRepoCache();
  logger.info("Repo cache refreshed", { path });
}

run().catch((error) => {
  logger.error("Repo cache refresh failed", { error: String(error) });
  process.exit(1);
});
