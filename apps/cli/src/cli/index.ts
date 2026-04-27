import { SentinelContract } from '@midnight-sentinel/api';
import { configureProviders } from '@midnight-sentinel/contract/providers';
import {
  getBalancesAndAddresses,
  printBalances,
  type WalletContext,
} from '@midnight-sentinel/wallet';
import type { Interface } from 'readline/promises';
import { type Config } from '../config.js';
import { circuitMenu, contractMenu } from './menus.js';

async function handleCircuits(
  contract: SentinelContract,
  _walletDetails: { seed: string; privateStateStoreName: string },
  walletCtx: WalletContext,
  rli: Interface
) {
  while (true) {
    const choice = await rli.question(circuitMenu);
    switch (choice) {
      case '1':
        try {
          const key = walletCtx.shieldedSecretKeys.coinPublicKey;
          const amount = await rli.question('Enter the amount you would like to delegate: ');
          await contract.delegate(key, BigInt(amount));
        } catch (e) {
          console.log('Error delegating: ', e);
        }
        break;
      case '2':
        try {
          await contract.redeemRewards();
        } catch (e) {
          console.log('Error redeeming rewards: ', e);
        }
        return;
      case '3':
        try {
          await contract.withdraw();
        } catch (e) {
          console.log('Error wthdrawing: ', e);
        }
        break;
      case '4':
        try {
          const amount = await rli.question(
            'Enter the amount you would like to deposit as rewards: '
          );
          // TODO: wire up to wallet
          await contract.depositRewards(
            BigInt(amount),
            new Uint8Array(32).fill(0),
            new Uint8Array(32).fill(0)
          );
        } catch (e) {
          console.log('Error depositing rewards: ', e);
        }
        return;
      case '5':
        await contract.getCurrentState();
        break;
      case '6':
        console.log('Exiting...');
        return;
      default:
        console.error('Invalid choice');
        continue;
    }
  }
}

export async function runCli(
  config: Config,
  walletDetails: { seed: string; privateStateStoreName: string },
  walletCtx: WalletContext,
  rli: Interface
): Promise<void> {
  let contract: SentinelContract | null = null;

  while (true) {
    const choice = await rli.question(contractMenu);

    switch (choice) {
      case '1': {
        const providers = await configureProviders(
          walletCtx,
          config,
          walletDetails.privateStateStoreName
        );
        contract = await SentinelContract.deploy(providers);

        console.log(
          `[Contract Address]: ${contract.deployedContract?.deployTxData.public.contractAddress}`
        );
        break;
      }
      case '2':
        try {
          const contractAddress = await rli.question('Enter the contract address: ');
          const providers = await configureProviders(
            walletCtx,
            config,
            walletDetails.privateStateStoreName
          );
          contract = await SentinelContract.join(providers, contractAddress);
        } catch (error: unknown) {
          console.error('Error joining contract:');
          if (error instanceof Error) {
            console.error(error.message);
          }
          console.error(error);
        }
        break;
      case '3':
        try {
          const raw = await rli.question('Enter the raw transaction recipe: ');
          await SentinelContract.zswapSponsor(walletCtx, raw);
        } catch (e) {
          console.log('Error sponsoring DUST: ', e);
        }
        break;
      case '4':
        try {
          const tokenColor = await rli.question('Enter token type to send (shielded): ');
          const tokenAmount = await rli.question('Enter amount to send: ');
          const recAddr = await rli.question('Enter address of the receiver: ');
          await SentinelContract.startZswap(walletCtx, tokenColor, tokenAmount, recAddr);
        } catch (e) {
          console.log('Error initiating zswap', e);
        }
        break;
      case '5': {
        const { balances, addresses } = await getBalancesAndAddresses(
          walletCtx.wallet,
          walletDetails.seed
        );
        printBalances(balances, addresses);
        break;
      }
      case '6':
        console.log('Exiting...');
        return;
      default:
        console.error('Invalid choice');
        continue;
    }

    if (contract) await handleCircuits(contract, walletDetails, walletCtx, rli);
  }
}
