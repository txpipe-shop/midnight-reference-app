import { TestContainers } from "@midnight-reference-app/containers";
import { createLogger } from "@midnight-reference-app/logger";
import { buildWallet, type WalletContext } from "@midnight-reference-app/wallet";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "readline/promises";
import { runCli } from "./cli/index.js";
import { env, StandaloneConfig } from "./config.js";
import { GENESIS_MINT_WALLET_SEED } from "./utils/constants.js";

const config = new StandaloneConfig();
const logger = createLogger(config.logDir);
const testContainers = new TestContainers(env.COMPOSE_DIR, env.COMPOSE_FILE, logger);


const main = async () => {
  const startedContainers = await testContainers.start();
  config.updateConfigURLs(testContainers);
  const walletCtx: WalletContext = await buildWallet(config, GENESIS_MINT_WALLET_SEED);
  const rli = createInterface({ input, output, terminal: true });
  await runCli(config, walletCtx, logger, rli).finally(walletCtx.wallet.stop);

};

await main().finally(testContainers.stop);