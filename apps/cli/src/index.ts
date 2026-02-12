import { TestContainers } from "@midnight-reference-app/containers";
import { createLogger } from "@midnight-reference-app/logger";
import { buildWallet } from "@midnight-reference-app/wallet";
import { runCli } from "./cli/index.js";
import { env, StandaloneConfig } from "./config.js";
import { GENESIS_MINT_WALLET_SEED } from "./utils/constants.js";

const main = async () => {
  const config = new StandaloneConfig();
  const logger = await createLogger(config.logDir);
  const testContainers = new TestContainers(env.COMPOSE_DIR, env.COMPOSE_FILE, logger);

  try {
    const startedContainers = await testContainers.start();
    config.updateConfigURLs(testContainers);
    const wallet = await buildWallet(config, GENESIS_MINT_WALLET_SEED);

    await runCli(config, startedContainers, logger);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await testContainers.stop();
  }
};

main();