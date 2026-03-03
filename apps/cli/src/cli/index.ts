import { normalizeRule, SentinelContract, validateRules } from '@midnight-sentinel/api';
import type { Input } from '@midnight-sentinel/contract';
import { configureProviders } from '@midnight-sentinel/contract/providers';
import {
  getBalancesAndAddresses,
  printBalances,
  type WalletContext,
} from '@midnight-sentinel/wallet';
import type { Interface } from 'readline/promises';
import { type Config } from '../config.js';
import { circuitMenu, contractMenu } from './menus.js';

// TODO: handle other types of inputs
const askForInputs = async (rli: Interface): Promise<Input[]> => {
  const inputs = []
  while (true) {
    const input: string = await rli.question(`Enter the input ${inputs.length + 1} (type "done" to finish): `);
    if (input === 'done') break;
    inputs.push({ uint: BigInt(input), boolean: false, bytes32: new Uint8Array(32), field: BigInt(0) });
  }


  return inputs;
}
const askForRules = async (rli: Interface): Promise<string[]> => {
  const rules = []
  while (true) {
    const rule: string = await rli.question(`Enter the rule ${rules.length + 1} (type "done" to finish): `);
    if (rule === 'done') break;
    rules.push(rule);
  }
  return rules;
}

async function handleCircuits(
  contract: SentinelContract,
  walletDetails: { seed: string, privateStateStoreName: string },
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
          console.log("Minted unshielded token on tx: ", tx?.public.txHash);
        } catch (err) {
          console.log(err);
        }
        break;
      case '2':
        try {
          const rule = await rli.question('Enter the rule to add (JSON): ');
          const parsedRule = JSON.parse(rule, normalizeRule);
          const validatedRule = validateRules(parsedRule);
          const tx = await contract.addRule(validatedRule);
          console.log("Rule ", SentinelContract.prettyRules(validatedRule), " added on tx: ", tx?.public.txHash);
        } catch (err) {
          console.log(err);
        }
        break;
      case '3':
        try {
          const address = await rli.question('Enter the public key of the rule owner to remove: ');
          const tx = await contract.removeRule(address);
          console.log("Rule removed on tx: ", tx?.public.txHash);
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
  walletDetails: { seed: string, privateStateStoreName: string },
  walletCtx: WalletContext,
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

        console.log(
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
