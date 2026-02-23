import { createLogger } from "@midnight-sentinel/logger";
import "dotenv/config";
import path from "node:path";
import { TestContainers } from "./containers.js";

// TODO: add command line arguments to stop and remove the containers
async function main() {
  console.log("Starting containers...");
  try {
    const composeDir = process.env.COMPOSE_DIR;
    const composeFile = process.env.COMPOSE_FILE;

    if (!composeDir || !composeFile)
      throw new Error(
        "COMPOSE_DIR and COMPOSE_FILE must be set in the .env file",
      );

    const logger = createLogger(
      path.resolve(composeDir, "..", "logs", "containers.log"),
    );
    const testContainers = new TestContainers(composeDir, composeFile, logger);
    await testContainers.start();
  } catch (err) {
    console.error("Error starting containers:", err);
    process.exit(1);
  }
}

main();
