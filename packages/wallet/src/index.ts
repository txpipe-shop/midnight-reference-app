import * as ledger from '@midnight-ntwrk/ledger-v8';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { type MidnightProvider, type WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  PublicKey,
  UnshieldedWallet,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as Rx from 'rxjs';
import { buildInitConfig } from './utils/configs.js';
import {
  deriveKeysFromSeed,
  registerForDustGeneration,
  signTransactionIntents,
  waitForFunds,
  waitForSync,
  withStatus,
} from './utils/index.js';
import { Config, WalletContext } from './utils/types.js';

export const buildWallet = async (config: Config, seed: string): Promise<WalletContext> => {
  setNetworkId(config.networkId ?? 'undeployed');
  // Derive HD keys and initialize the three sub-wallets
  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = await withStatus(
    'Building wallet',
    async () => {
      const keys = deriveKeysFromSeed(seed);

      const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
      const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
      const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

      const wallet = await WalletFacade.init({
        configuration: buildInitConfig(config),
        shielded: (config) => ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
        unshielded: (config) =>
          UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
        dust: (config) =>
          DustWallet(config).startWithSecretKey(
            dustSecretKey,
            ledger.LedgerParameters.initialParameters().dust
          ),
      });
      await wallet.start(shieldedSecretKeys, dustSecretKey);

      return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
    }
  );

  // Wait for the wallet to sync with the network
  const syncedState = await withStatus('Syncing with network', () => waitForSync(wallet));

  // Check if wallet has funds; if not, wait for incoming tokens
  const balance = syncedState.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n;
  if (balance === 0n) {
    await withStatus('Waiting for incoming tokens', () => waitForFunds(wallet));
  }

  // Register NIGHT UTXOs for dust generation (required for tx fees on Preprod/Preview)
  await registerForDustGeneration(wallet, unshieldedKeystore);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

/**
 * Builds and synchronizes a wallet without waiting for funds or registering
 * NIGHT for DUST generation. Verification harnesses use this for deliberately
 * DUST-less beneficiaries that will be funded after initialization.
 */
export const buildUnfundedWallet = async (config: Config, seed: string): Promise<WalletContext> => {
  setNetworkId(config.networkId ?? 'undeployed');
  const keys = deriveKeysFromSeed(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());
  const wallet = await WalletFacade.init({
    configuration: buildInitConfig(config),
    shielded: (walletConfig) =>
      ShieldedWallet(walletConfig).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (walletConfig) =>
      UnshieldedWallet(walletConfig).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (walletConfig) =>
      DustWallet(walletConfig).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust
      ),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  await waitForSync(wallet);
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

/**
 * Create the unified WalletProvider & MidnightProvider for midnight-js.
 * This bridges the wallet-sdk-facade to the midnight-js contract API by
 * implementing balance, sign, finalize, and submit operations.
 */
export const createWalletAndMidnightProvider = async (
  ctx: WalletContext
): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  return {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx, ttl?) {
      console.log('[balanceTx] Starting transaction balancing...');
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        {
          shieldedSecretKeys: ctx.shieldedSecretKeys,
          dustSecretKey: ctx.dustSecretKey,
        },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) }
      );
      console.log('[balanceTx] Transaction balanced, signing...');

      // Work around wallet SDK bug: signRecipe uses hardcoded 'pre-proof'
      // marker when cloning intents, but proven (UnboundTransaction) intents
      // have 'proof' data, causing "Failed to clone intent". We sign manually
      // with the correct proof markers.
      const signFn = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      }

      console.log('[balanceTx] Transaction signed, finalizing...');
      const finalized = ctx.wallet.finalizeRecipe(recipe);
      console.log('[balanceTx] Transaction finalized.');
      return finalized;
    },
    submitTx(tx) {
      console.log('[submitTx] Submitting transaction to network...');
      return ctx.wallet.submitTransaction(tx);
    },
  };
};

export {
  getBalances,
  getBalancesAndAddresses,
  printBalances,
  type Addresses,
  type Balances,
} from './utils/balances.js';
export { signTransactionIntents } from './utils/index.js';
export { WalletContext } from './utils/types.js';
export { getNetworkId, setNetworkId };
