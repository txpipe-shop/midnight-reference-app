import type { WalletContext } from "@midnight-sentinel/wallet";
import { type Logger } from "pino";
import type { Interface } from "readline/promises";
import { SentinelContract } from "../api/index.js";
import { type Config } from "../config.js";
import { circuitMenu, contractMenu, enterNumber } from "./menus.js";

async function handleCircuits(
  contract: SentinelContract,
  walletCtx: WalletContext,
  logger: Logger,
  rli: Interface,
) {
  while (true) {
    const choice = await rli.question(circuitMenu);

    switch (choice) {
      case "1":
        try {
          const input = await rli.question(enterNumber);
          const address = await walletCtx.wallet.unshielded.getAddress();
          const tx = await contract.mintToken(
            BigInt(input),
            Buffer.from(address.hexString, "hex"),
          );
          logger.info(`Minting tx hash: ${tx?.public.txHash}`);
        } catch (err) {
          console.log(err);
        }
        return;
    }
  }
}

export async function runCli(
  config: Config,
  walletCtx: WalletContext,
  logger: Logger,
  rli: Interface,
): Promise<void> {
  let contract: SentinelContract | null = null;

  while (true) {
    const choice = await rli.question(contractMenu);

    switch (choice) {
      case "1":
        contract = await SentinelContract.deploy(walletCtx, config, {
          secretKey: new Uint8Array(32).fill(0),
        });
        logger.info(
          `[Contract Address]: ${contract.deployedContract?.deployTxData.public.contractAddress}`,
        );
        break;
      case "2":
        try {
          const contractAddress = await rli.question(
            "Enter the contract address: ",
          );
          contract = await SentinelContract.join(
            walletCtx,
            config,
            contractAddress,
            { secretKey: new Uint8Array(32).fill(0) },
          );
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

    if (contract) await handleCircuits(contract, walletCtx, logger, rli);
  }
}
