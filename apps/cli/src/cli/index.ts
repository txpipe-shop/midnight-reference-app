import { rulesBuilder, SentinelContract } from '@midnight-sentinel/api';
import { configureProviders } from '@midnight-sentinel/contract/providers';
import {
  getBalancesAndAddresses,
  printBalances,
  type WalletContext,
} from '@midnight-sentinel/wallet';
import { type Logger } from 'pino';
import type { Interface } from 'readline/promises';
import { type Config } from '../config.js';
import { circuitMenu, contractMenu } from './menus.js';

async function handleCircuits(
  contract: SentinelContract,
  walletDetails: { seed: string, privateStateStoreName: string },
  walletCtx: WalletContext,
  logger: Logger,
  rli: Interface
) {
  while (true) {
    const choice = await rli.question(circuitMenu);

    switch (choice) {
      case '1':
        try {
          throw new Error("Not implemented");
        } catch (err) {
          console.log(err);
        }
        break;
      case '2':
        try {
          const rule = rulesBuilder()
            .when((r) => r.uint.eq(100))
            .or((r) => r.uint.lt(15))
            .build();
          const tx = await contract.addRule(rule);
          console.log("Rule ", SentinelContract.prettyRules(rule), " added on tx: ", tx?.public.txHash);
        } catch (err) {
          console.log(err);
        }
        break;
      case '3':
        try {
          throw new Error("Not implemented");
        } catch (err) {
          console.log(err);
        }
        break;
      case '4':
        try {
          throw new Error("Not implemented");
        } catch (err) {
          console.log(err);
        }
        break;
      case '5':
        try {
          const { balances, addresses } = await getBalancesAndAddresses(
            walletCtx.wallet,
            walletDetails.seed
          );
          printBalances(balances, addresses);
        } catch (err) {
          console.log(err);
        }
        break;
      case '6': {
        try {
          await contract.getCurrentState();
        } catch (err) {
          console.log(err);
        }
        break;
      }
      case '7':
        logger.info('Exiting...');
        return;
      default:
        logger.error('Invalid choice');
        continue;
    }
  }
}

export async function runCli(
  config: Config,
  walletDetails: { seed: string, privateStateStoreName: string },
  walletCtx: WalletContext,
  logger: Logger,
  rli: Interface
): Promise<void> {
  let contract: SentinelContract | null = null;

  while (true) {
    const choice = await rli.question(contractMenu);

    switch (choice) {
      case '1': {
        const secretKey = crypto.getRandomValues(new Uint8Array(32));
        const providers = await configureProviders(walletCtx, config, walletDetails.privateStateStoreName);
        contract = await SentinelContract.deploy(providers, { secretKey });

        logger.info(
          `[Contract Address]: ${contract.deployedContract?.deployTxData.public.contractAddress}`
        );
        break;
      }
      case '2':
        try {
          const contractAddress = await rli.question('Enter the contract address: ');

          const secretKey = crypto.getRandomValues(new Uint8Array(32));
          const providers = await configureProviders(walletCtx, config, walletDetails.privateStateStoreName);
          contract = await SentinelContract.join(providers, contractAddress, {
            secretKey,
          });
        } catch (error: unknown) {
          logger.error('Error joining contract:');
          if (error instanceof Error) {
            logger.error(error.message);
          }
          logger.error(error);
        }
        break;
      case '3': {
        const { balances, addresses } = await getBalancesAndAddresses(
          walletCtx.wallet,
          walletDetails.seed
        );
        printBalances(balances, addresses);
        break;
      }
      case '4':
        logger.info('Exiting...');
        return;
      default:
        logger.error('Invalid choice');
        continue;
    }

    if (contract) await handleCircuits(contract, walletDetails, walletCtx, logger, rli);
  }
}
