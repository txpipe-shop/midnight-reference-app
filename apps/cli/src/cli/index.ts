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
import { GENESIS_MINT_WALLET_SEED } from '../utils/constants.js';
import { circuitMenu, contractMenu, enterNumber } from './menus.js';

async function handleCircuits(
  contract: SentinelContract,
  walletCtx: WalletContext,
  logger: Logger,
  rli: Interface
) {
  while (true) {
    const choice = await rli.question(circuitMenu);

    switch (choice) {
      case '1':
        try {
          const input = await rli.question(enterNumber);
          const address = await walletCtx.wallet.unshielded.getAddress();
          const tx = await contract.mintToken(BigInt(input), Buffer.from(address.hexString, 'hex'));
          logger.info(`Minting tx hash: ${tx?.public.txHash}`);
        } catch (err) {
          console.log(err);
        }
        break;
      case '2':
        try {
          await contract.updateRules();
        } catch (err) {
          console.log(err);
        }
        break;
      case '3': {
        const { balances, addresses } = await getBalancesAndAddresses(
          walletCtx.wallet,
          GENESIS_MINT_WALLET_SEED
        );
        printBalances(balances, addresses);
        break;
      }
      case '4':
        logger.info(
          `Exiting contract address: ${contract.deployedContract?.deployTxData.public.contractAddress}`
        );
        return;
      default:
        logger.error('Invalid choice');
        continue;
    }
  }
}

export async function runCli(
  config: Config,
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
        console.log({ secretKey: Buffer.from(secretKey).toString('hex') });

        const providers = await configureProviders(walletCtx, config);
        const rules = rulesBuilder()
          .when((r) => r.uint.eq(123))
          .or((r) => r.uint.eq(124))
          .build();
        contract = await SentinelContract.deploy(providers, { secretKey }, rules);
        logger.info(
          `[Contract Address]: ${contract.deployedContract?.deployTxData.public.contractAddress}`
        );
        break;
      }
      case '2':
        try {
          const contractAddress = await rli.question('Enter the contract address: ');
          const secretKey = await rli.question('Enter the secret key: ');

          const providers = await configureProviders(walletCtx, config);
          contract = await SentinelContract.join(providers, contractAddress, {
            secretKey: new Uint8Array(Buffer.from(secretKey, 'hex')),
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
          GENESIS_MINT_WALLET_SEED
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

    if (contract) await handleCircuits(contract, walletCtx, logger, rli);
  }
}
