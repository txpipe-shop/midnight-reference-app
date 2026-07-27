import { SentinelContract } from '@midnight-sentinel/api';
import {
  dustPublicKeyToBytes,
  nativeNightSponsorshipConfig,
  sponsorAndSubmit,
  sponsorshipAllowlistHash,
} from '@midnight-sentinel/api/sponsorship';
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
  _walletCtx: WalletContext,
  rli: Interface
) {
  while (true) {
    const choice = await rli.question(circuitMenu);
    switch (choice) {
      case '1':
        await contract.getCurrentState();
        break;
      case '2':
        try {
          await contract.setSponsorshipEnabled(false);
        } catch (e) {
          console.log('Error pausing sponsorship: ', e);
        }
        break;
      case '3':
        try {
          await contract.setSponsorshipEnabled(true);
        } catch (e) {
          console.log('Error resuming sponsorship: ', e);
        }
        break;
      case '4':
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
        const fixedPrice = BigInt(
          (await rli.question('Sponsorship price in shielded NIGHT [100]: ')) || '100'
        );
        const targetAddress = (
          await rli.question('Initial allowed target contract address: ')
        ).trim();
        const targetEntryPoint = (
          await rli.question('Initial allowed target circuit: ')
        ).trim();
        const policyHash = sponsorshipAllowlistHash([
          { address: targetAddress, entryPoint: targetEntryPoint },
        ]);
        contract = await SentinelContract.deploy(
          providers,
          nativeNightSponsorshipConfig(
            walletCtx,
            policyHash,
            fixedPrice
          )
        );

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
          const sentinelAddress = (
            await rli.question('Sentinel sponsorship contract address: ')
          ).trim();
          const targetAddress = (await rli.question('Allowed target contract address: ')).trim();
          const targetEntryPoint = (await rli.question('Allowed target circuit: ')).trim();
          const maxFee = BigInt(await rli.question('Maximum DUST fee: '));
          const raw = (await rli.question('Prepared transaction (hex): ')).trim();
          const allowedTargets = [{ address: targetAddress, entryPoint: targetEntryPoint }];
          const providers = await configureProviders(
            walletCtx,
            config,
            walletDetails.privateStateStoreName
          );
          const result = await sponsorAndSubmit(
            Uint8Array.from(Buffer.from(raw, 'hex')),
            {
              sentinelAddress,
              sponsorId: dustPublicKeyToBytes(walletCtx.dustSecretKey.publicKey),
              policyHash: sponsorshipAllowlistHash(allowedTargets),
              allowedTargets,
              minTtlMs: 30_000,
              maxTtlMs: 65 * 60 * 1_000,
              maxFee,
            },
            providers,
            walletCtx
          );
          console.log(
            JSON.stringify({
              txId: result.txId,
              status: result.status,
              feeEstimate: result.feeEstimate.toString(),
              targetAddress: result.targetAddress,
              targetEntryPoint: result.targetEntryPoint,
            })
          );
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
