import { TestContainers } from "@midnight-sentinel/containers";
import { createLogger } from "@midnight-sentinel/logger";
import {
  buildWallet,
  type WalletContext,
} from "@midnight-sentinel/wallet";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "readline/promises";
import { runCli } from "./cli/index.js";
import { env, StandaloneConfig } from "./config.js";
import { GENESIS_MINT_WALLET_SEED } from "./utils/constants.js";

const config = new StandaloneConfig();
const logger = createLogger(config.logDir);
const testContainers = new TestContainers(
  env.COMPOSE_DIR,
  env.COMPOSE_FILE,
  logger,
);

const main = async () => {
  console.log("Starting");
  await testContainers.start();
  console.log("Test containers began");
  // config.updateConfigURLs(testContainers);
  const walletCtx: WalletContext = await buildWallet(
    config,
    GENESIS_MINT_WALLET_SEED,
  );
  console.log("Wallet synced");
  const rli = createInterface({ input, output, terminal: true });
  await runCli(config, walletCtx, logger, rli).finally(
    walletCtx.wallet.stop.bind(walletCtx.wallet),
  );
  process.exit(0)
};

await main()
  .catch(console.error).finally(testContainers.stop.bind(testContainers));
