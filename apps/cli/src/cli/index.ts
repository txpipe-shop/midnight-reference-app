import type { WalletContext } from "@midnight-reference-app/wallet";
import { type Logger } from "pino";
import type { Interface } from "readline/promises";
import { ExampleContract } from "../api/index.js";
import { type Config } from "../config.js";
import { circuitMenu, contractMenu } from "./menus.js";

async function handleCircuits(contract: ExampleContract, logger: Logger, rli: Interface) {
  while (true) {
    const choice = await rli.question(circuitMenu);

    switch (choice) {
      case "1":
        const trueResponse = await contract.returnTrue();
        logger.info(`True response: ${trueResponse}`);
        break;
      case "2":
        logger.info("Exiting...");
        return;
    }
  }
}

export async function runCli(
  config: Config,
  walletCtx: WalletContext,
  logger: Logger,
  rli: Interface
): Promise<void> {
  let contract: ExampleContract | null = null;

  while (true) {
    const choice = await rli.question(contractMenu);

    switch (choice) {
      case "1":
        contract = await ExampleContract.deploy(walletCtx, config, { secretKey: new Uint8Array(32).fill(0) });
        break;
      case "2":
        try {
          const contractAddress = await rli.question("Enter the contract address: ");
          contract = await ExampleContract.join(walletCtx, config, contractAddress, { secretKey: new Uint8Array(32).fill(0) });
        } catch (error: unknown) {
          logger.error("Error joining contract:");
          if (error instanceof Error) {
            logger.error(error.message);
          }
          logger.error(error);
        }
        break;
      case "3":
        logger.info("Exiting...");
        return;
      default:
        continue;
    }

    if (contract) await handleCircuits(contract, logger, rli);
  }
}
