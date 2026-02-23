import { createLogger } from "@midnight-sentinel/logger";
import { buildWallet, type WalletContext } from "@midnight-sentinel/wallet";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "readline/promises";
import { runCli } from "./cli/index.js";
import { StandaloneConfig } from "./config.js";
import { GENESIS_MINT_WALLET_SEED } from "./utils/constants.js";

const config = new StandaloneConfig();
const logger = createLogger(config.logDir);

const main = async () => {
  console.log("Starting");
  const walletCtx: WalletContext = await buildWallet(
    config,
    GENESIS_MINT_WALLET_SEED,
  );
  console.log("Wallet synced");
  const rli = createInterface({ input, output, terminal: true });
  await runCli(config, walletCtx, logger, rli).finally(
    walletCtx.wallet.stop.bind(walletCtx.wallet),
  );
  process.exit(0);
};

await main().catch(console.error);
