import { buildWallet, type WalletContext } from '@midnight-sentinel/wallet';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'readline/promises';
import { runCli } from './cli/index.js';
import { StandaloneConfig } from './config.js';
import {
  GENESIS_MINT_WALLET_SEED_ONE,
  GENESIS_MINT_WALLET_SEED_THREE,
  GENESIS_MINT_WALLET_SEED_TWO,
} from './utils/constants.js';

type WalletSelection = 'DEPLOY' | 'JOIN' | 'THIRD';
const getWalletFromArgs = (): WalletSelection => {
  const args = process.argv.slice(2);
  const flagIndex = args.findIndex((arg) => arg === '-w' || arg === '--wallet');

  if (flagIndex === -1 || !args[flagIndex + 1]) return 'DEPLOY';

  const value = args[flagIndex + 1]!.toUpperCase();
  if (value === 'DEPLOY' || value === 'JOIN' || value === 'THIRD') {
    return value;
  }

  console.warn(`Unknown wallet "${value}", defaulting to DEPLOY`);
  return 'DEPLOY';
};

const getWalletDetails = (
  wallet: WalletSelection
): { seed: string; privateStateStoreName: string } => {
  switch (wallet) {
    case 'DEPLOY':
      return { seed: GENESIS_MINT_WALLET_SEED_ONE, privateStateStoreName: 'deploy' };
    case 'JOIN':
      return { seed: GENESIS_MINT_WALLET_SEED_TWO, privateStateStoreName: 'join' };
    case 'THIRD':
      return { seed: GENESIS_MINT_WALLET_SEED_THREE, privateStateStoreName: 'third' };
  }
};

const config = new StandaloneConfig();
const main = async () => {
  const wallet = getWalletFromArgs();
  console.log(`Starting CLI with "${wallet}" wallet`);

  const walletDetails = getWalletDetails(wallet);

  console.log('Building wallet...');
  const walletCtx: WalletContext = await buildWallet(config, walletDetails.seed);
  console.log('Wallet synced');

  const rli = createInterface({ input, output, terminal: true });
  await runCli(config, walletDetails, walletCtx, rli).finally(
    walletCtx.wallet.stop.bind(walletCtx.wallet)
  );

  process.exit(0);
};

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
