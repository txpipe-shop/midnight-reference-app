import { TestContainers } from "@midnight-reference-app/containers";
import { createLogger } from "@midnight-reference-app/logger";
import { runCli } from "./cli/index.js";
import { env, StandaloneConfig } from "./config.js";

const main = async () => {
  const config = new StandaloneConfig();
  const logger = await createLogger(config.logDir);
  const testContainers = new TestContainers(env.COMPOSE_DIR, env.COMPOSE_FILE, logger);

  config.indexer = testContainers.getContainerPort(testContainers.getContainerName('indexer'), config.indexer);
  config.indexerWS = testContainers.getContainerPort(testContainers.getContainerName('indexer'), config.indexerWS);
  config.node = testContainers.getContainerPort(testContainers.getContainerName('node'), config.node);
  config.proofServer = testContainers.getContainerPort(testContainers.getContainerName('proof-server'), config.proofServer);

  await runCli(config, testContainers, logger);
};

main();