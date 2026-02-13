import { TestContainers } from "@midnight-reference-app/containers";
import { createLogger } from "@midnight-reference-app/logger";
import { buildWallet, type WalletContext } from "@midnight-reference-app/wallet";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "readline/promises";
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
    const walletCtx: WalletContext = await buildWallet(config, GENESIS_MINT_WALLET_SEED);

    try {
      const rli = createInterface({ input, output, terminal: true });
      await runCli(config, startedContainers, walletCtx, logger, rli);
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    } finally {
      await walletCtx.wallet.stop();
    }

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await testContainers.stop();
  }
};

main();