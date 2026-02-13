import "./lib/env.js";
import { logger } from "./lib/logger.js";

const command = process.argv[2];

switch (command) {
  case "worker":
    logger.info("Use `npm run worker` to start the Temporal worker.");
    break;
  case "run":
    logger.info("Use `npm run run` to execute a workflow run.");
    break;
  default:
    logger.info("Agent CLI");
    logger.info("Commands:");
    logger.info("  npm run worker   # start Temporal worker");
    logger.info("  npm run run      # run a workflow once");
    break;
}
