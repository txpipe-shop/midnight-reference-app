import type { WalletContext } from "@midnight-sentinel/wallet";
import { type Logger } from "pino";
import type { Interface } from "readline/promises";
import { SentinelContract } from "@midnight-sentinel/api";
import { type Config } from "../config.js";
import { configureProviders } from "@midnight-sentinel/contract/providers";
import {
  circuitMenu,
  contractMenu,
  enterNumber,
  nullifierSecret,
} from "./menus.js";
import { type Rules as SentinelRules, Ord as SentinelOrdOp, Eq as SentinelEqOp, pureCircuits } from "@midnight-sentinel/contract";

const sampleRules: SentinelRules = [
  {
    is_some: true,
    value: [
      {
        is_some: true,
        value: {
          is_left: true,
          left: {
            op: SentinelOrdOp.EQ,
            value: 123n,
          },
          right: {
            is_left: false,
            right: {
              is_left: false,
              left: {
                op: SentinelEqOp.EQ,
                value: new Uint8Array(32).fill(0),
              },
              right: {
                right: {
                  op: SentinelEqOp.EQ,
                  nullifier: new Uint8Array(32).fill(0),
                },
                is_left: false,
                left: {
                  op: SentinelEqOp.EQ,
                  value: 1n,
                },
              },
            },
            left: {
              value: true,
              op: SentinelEqOp.EQ,
            },
          },
        },
      },
      {
        is_some: true,
        value: {
          is_left: true,
          left: {
            op: SentinelOrdOp.EQ,
            value: 123n,
          },
          right: {
            is_left: false,
            right: {
              is_left: false,
              left: {
                op: SentinelEqOp.EQ,
                value: new Uint8Array(32).fill(0),
              },
              right: {
                right: {
                  op: SentinelEqOp.EQ,
                  nullifier: new Uint8Array(32).fill(0),
                },
                is_left: false,
                left: {
                  op: SentinelEqOp.EQ,
                  value: 1n,
                },
              },
            },
            left: {
              value: true,
              op: SentinelEqOp.EQ,
            },
          },
        },
      },
    ],
  },
  {
    is_some: true,
    value: [
      {
        is_some: true,
        value: {
          is_left: false,
          left: {
            op: SentinelOrdOp.EQ,
            value: 123n,
          },
          right: {
            is_left: false,
            right: {
              is_left: false,
              left: {
                op: SentinelEqOp.EQ,
                value: new Uint8Array(32).fill(0),
              },
              right: {
                right: {
                  op: SentinelEqOp.EQ,
                  nullifier: pureCircuits.nullifier(
                    new Uint8Array(32).fill(0),
                  ),
                },
                is_left: false,
                left: {
                  op: SentinelEqOp.EQ,
                  value: 1n,
                },
              },
            },
            left: {
              value: true,
              op: SentinelEqOp.EQ,
            },
          },
        },
      },
      {
        is_some: false,
        value: {
          is_left: true,
          left: {
            op: SentinelOrdOp.EQ,
            value: 123n,
          },
          right: {
            is_left: false,
            right: {
              is_left: false,
              left: {
                op: SentinelEqOp.EQ,
                value: new Uint8Array(32).fill(0),
              },
              right: {
                right: {
                  op: SentinelEqOp.EQ,
                  nullifier: new Uint8Array(32).fill(0),
                },
                is_left: false,
                left: {
                  op: SentinelEqOp.EQ,
                  value: 1n,
                },
              },
            },
            left: {
              value: true,
              op: SentinelEqOp.EQ,
            },
          },
        },
      },
    ],
  },
];

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
          const nullifierInput = await rli.question(nullifierSecret);
          const address = await walletCtx.wallet.unshielded.getAddress();
          const tx = await contract.mintToken(
            BigInt(input),
            Number.parseInt(nullifierInput),
            Buffer.from(address.hexString, "hex"),
          );
          logger.info(`Minting tx hash: ${tx?.public.txHash}`);
        } catch (err) {
          console.log(err);
        }
        return;
      case "2":
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
      case "1": {
        const providers = await configureProviders(walletCtx, {
          indexer: config.indexer,
          indexerWS: config.indexerWS,
          proofServer: config.proofServer,
        });
        contract = await SentinelContract.deploy(providers, {
          secretKey: new Uint8Array(32).fill(0),
        }, sampleRules);
        logger.info(
          `[Contract Address]: ${contract.deployedContract?.deployTxData.public.contractAddress}`,
        );
        break;
      }
      case "2":
        try {
          const contractAddress = await rli.question(
            "Enter the contract address: ",
          );
          const providers = await configureProviders(walletCtx, {
            indexer: config.indexer,
            indexerWS: config.indexerWS,
            proofServer: config.proofServer,
          });
          contract = await SentinelContract.join(
            providers,
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
