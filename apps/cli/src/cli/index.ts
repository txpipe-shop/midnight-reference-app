import { communicationCommitmentRandomness, fromHex, toHex } from '@midnight-ntwrk/compact-runtime';
import { normalizeRule, SentinelContract, validateRules } from '@midnight-sentinel/api';
import { configureProviders } from '@midnight-sentinel/contract/providers';
import {
  getBalancesAndAddresses,
  printBalances,
  type WalletContext,
} from '@midnight-sentinel/wallet';
import type { Interface } from 'readline/promises';
import { type Config } from '../config.js';
import { circuitMenu, contractMenu } from './menus.js';
import { askForInputs, askForRules } from './prompts.js';

async function handleCircuits(
  contract: SentinelContract,
  walletDetails: { seed: string; privateStateStoreName: string },
  walletCtx: WalletContext,
  rli: Interface
) {
  while (true) {
    const choice = await rli.question(circuitMenu);
    switch (choice) {
      case '1':
        try {
          const inputs = await askForInputs(rli);
          const rules = await askForRules(rli);
          const recipient = await walletCtx.wallet.unshielded.getAddress();
          const tx = await contract.mintToken(inputs, rules, recipient);
          console.log('Minted unshielded token on tx: ', tx?.public.txHash);
        } catch (err) {
          console.log(err);
        }
        break;
      case '2':
        try {
          const rule = await rli.question('Enter the rule to add (JSON): ');
          const parsedRule = JSON.parse(rule, normalizeRule);
          const validatedRule = validateRules(parsedRule);

          const nonceHex = communicationCommitmentRandomness();
          const nonce = fromHex(nonceHex).slice(0, 32);
          console.log('Your nonce for this rule is: ', toHex(nonce));

          const tx = await contract.addRule(validatedRule, nonce);
          console.log(
            'Rule ',
            SentinelContract.prettyRules(validatedRule),
            ' added on tx: ',
            tx?.public.txHash
          );
        } catch (err) {
          console.log(err);
        }
        break;
      case '3':
        try {
          const nonce = await rli.question(
            'You will remove the rule with your public key and the nonce you provided.\nEnter the nonce: '
          );
          const nonceBytes = fromHex(nonce);
          const tx = await contract.removeRule(nonceBytes);
          console.log('Rule removed on tx: ', tx?.public.txHash);
        } catch (err) {
          console.log(err);
        }
        break;
      case '4':
        console.log(`Not implemented yet`);
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
        const secretKey = crypto.getRandomValues(new Uint8Array(32));
        const providers = await configureProviders(
          walletCtx,
          config,
          walletDetails.privateStateStoreName
        );
        contract = await SentinelContract.deploy(providers, { secretKey });

        console.log(
          `[Contract Address]: ${contract.deployedContract?.deployTxData.public.contractAddress}`
        );
        break;
      }
      case '2':
        try {
          const contractAddress = await rli.question('Enter the contract address: ');

          const secretKey = crypto.getRandomValues(new Uint8Array(32));
          const providers = await configureProviders(
            walletCtx,
            config,
            walletDetails.privateStateStoreName
          );
          contract = await SentinelContract.join(providers, contractAddress, {
            secretKey,
          });
        } catch (error: unknown) {
          console.error('Error joining contract:');
          if (error instanceof Error) {
            console.error(error.message);
          }
          console.error(error);
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
        console.log('Exiting...');
        return;
      default:
        console.error('Invalid choice');
        continue;
    }

    if (contract) await handleCircuits(contract, walletDetails, walletCtx, rli);
  }
}
