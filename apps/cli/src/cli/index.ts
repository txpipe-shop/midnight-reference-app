import type { WalletContext } from '@midnight-sentinel/wallet';
import { type Logger } from 'pino';
import type { Interface } from 'readline/promises';
import { SentinelContract } from '../api/index.js';
import { type Config } from '../config.js';
import { getBalances, printBalances } from './balances.js';
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
          const tx = await contract.mintToken(
            BigInt(input),
            Buffer.from(address.hexString, 'hex')
          );
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
      case '3':
        const balances = await getBalances(walletCtx.wallet);
        printBalances(balances);
        break;
      case '4':
        logger.info(`Exiting contract address: ${contract.deployedContract?.deployTxData.public.contractAddress}`);
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
      case "1":
        const secretKey = crypto.getRandomValues(new Uint8Array(32));
        console.log({ secretKey: Buffer.from(secretKey).toString('hex') });
        contract = await SentinelContract.deploy(walletCtx, config, {
          secretKey,
        });
        logger.info(
          `[Contract Address]: ${contract.deployedContract?.deployTxData.public.contractAddress}`
        );
        break;
      case '2':
        try {
          const contractAddress = await rli.question(
            "Enter the contract address: ",
          );
          const secretKey = await rli.question(
            "Enter the secret key: ",
          );

          contract = await SentinelContract.join(
            walletCtx,
            config,
            contractAddress,
            { secretKey: new Uint8Array(Buffer.from(secretKey, "hex")) },
          );
        } catch (error: unknown) {
          logger.error('Error joining contract:');
          if (error instanceof Error) {
            logger.error(error.message);
          }
          logger.error(error);
        }
        break;
      case '3':
        const balances = await getBalances(walletCtx.wallet);
        printBalances(balances);
        break
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
