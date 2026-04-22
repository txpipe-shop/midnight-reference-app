/**
 * Zswap-sponsor demo
 *
 * Demonstrates the pattern from zswap-sponsor-guide.md:
 *   - Three wallets built from hardcoded genesis seeds
 *   - Sentinel contract deployed, then custom shielded tokens minted
 *     directly into Wallets A and C via mintAndSendShielded
 *   - Wallet A initiates an atomic swap (offers tokens, does NOT pay fees)
 *   - Wallet C balances the swap AND sponsors DUST fees in one atomic tx
 *
 * Net result: Wallet A pays Wallet C 100 tokens;
 *             Wallet C pays the DUST transaction fees.
 *
 * Run: pnpm dev-sponsor  (from apps/cli)
 */

import { SentinelContract } from '@midnight-sentinel/api';
import { configureProviders } from '@midnight-sentinel/contract/providers';
import {
  buildWallet,
  getBalancesAndAddresses,
  printBalances,
  type WalletContext,
} from '@midnight-sentinel/wallet';
import {
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import { StandaloneConfig } from './config.js';
import {
  GENESIS_MINT_WALLET_SEED_ONE,
  GENESIS_MINT_WALLET_SEED_THREE,
  GENESIS_MINT_WALLET_SEED_TWO,
} from './utils/constants.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** Tokens Wallet A offers into the swap. */
const OFFER_AMOUNT = 200n;

/** Tokens Wallet A wants back (Wallet C nets OFFER - WANT = 100 tokens). */
const WANT_AMOUNT = 100n;

/** Rolling 30-minute TTL for all transactions. */
const TTL = () => new Date(Date.now() + 30 * 60 * 1_000);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a ShieldedAddress object from a wallet context. No async needed — keys are in ctx. */
function shieldedAddrOf(ctx: WalletContext): ShieldedAddress {
  return new ShieldedAddress(
    ShieldedCoinPublicKey.fromHexString(ctx.shieldedSecretKeys.coinPublicKey),
    ShieldedEncryptionPublicKey.fromHexString(ctx.shieldedSecretKeys.encryptionPublicKey),
  );
}

/** Print balances for a single wallet, waiting for sync first. */
async function showBalances(label: string, ctx: WalletContext, seed: string): Promise<void> {
  console.log(`\n--- ${label} ---`);
  const { balances, addresses } = await getBalancesAndAddresses(ctx.wallet, seed);
  printBalances(balances, addresses);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const config = new StandaloneConfig();

const main = async () => {
  // ── 1. Build three wallets ────────────────────────────────────────────────
  console.log('\n=== Building wallets ===');
  const [ctxA, ctxB, ctxC] = await Promise.all([
    buildWallet(config, GENESIS_MINT_WALLET_SEED_ONE), // admin / payer
    buildWallet(config, GENESIS_MINT_WALLET_SEED_TWO), // observer
    buildWallet(config, GENESIS_MINT_WALLET_SEED_THREE), // recipient / fee sponsor
  ]);

  // ── 2. Initial balances ───────────────────────────────────────────────────
  console.log('\n=== Initial balances ===');
  await showBalances('Wallet A', ctxA, GENESIS_MINT_WALLET_SEED_ONE);
  await showBalances('Wallet B', ctxB, GENESIS_MINT_WALLET_SEED_TWO);
  await showBalances('Wallet C', ctxC, GENESIS_MINT_WALLET_SEED_THREE);

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // ── 3. Deploy Sentinel contract and mint shielded tokens ──────────────────
  //
  // mintDirectShielded mints a custom shielded token directly into the
  // recipient's shielded wallet — no NIGHT shielding step required.
  console.log('\n=== Deploying contract and minting shielded tokens ===');

  // Snapshot Wallet A's shielded token keys before minting so we can identify the new one.
  const { balances: preMintA } = await getBalancesAndAddresses(ctxA.wallet, GENESIS_MINT_WALLET_SEED_ONE);
  const knownTokens = new Set(Object.keys(preMintA.shielded));

  const providers = await configureProviders(ctxA, config, 'zswap-sponsor-contract');

  console.log('  Deploying Sentinel contract...');
  const contract = await SentinelContract.deploy(providers);
  console.log('  ✓ Contract deployed');
  await sleep(10_000);

  console.log('  Minting shielded tokens to Wallet A...');
  await contract.mintFreeToken(
    ctxA.shieldedSecretKeys.coinPublicKey,
    ctxA.shieldedSecretKeys.encryptionPublicKey,
  );
  console.log('  ✓ Minted to Wallet A');
  await sleep(10_000);

  console.log('  Minting shielded tokens to Wallet C...');
  await contract.mintFreeToken(
    ctxC.shieldedSecretKeys.coinPublicKey,
    ctxC.shieldedSecretKeys.encryptionPublicKey,
  );
  console.log('  ✓ Minted to Wallet C');
  await sleep(10_000);

  // Find the newly minted token by comparing against the pre-mint snapshot.
  const { balances: postMintA } = await getBalancesAndAddresses(ctxA.wallet, GENESIS_MINT_WALLET_SEED_ONE);
  const customToken = Object.keys(postMintA.shielded).find((k) => !knownTokens.has(k))!;
  if (!customToken) throw new Error('Custom token not found in Wallet A after minting');

  console.log('\n=== Balances after minting ===');
  console.log('  Custom token type:', customToken);
  await showBalances('Wallet A', ctxA, GENESIS_MINT_WALLET_SEED_ONE);
  await showBalances('Wallet C', ctxC, GENESIS_MINT_WALLET_SEED_THREE);

  // ── 4. Zswap-sponsor flow ─────────────────────────────────────────────────
  //
  // Wallet A offers OFFER_AMOUNT and wants WANT_AMOUNT back.
  // Net: A loses 100 tokens; C gains 100 tokens and pays DUST fees.
  //
  // Wallet A sets payFees: false — it does NOT pay fees.
  // Wallet C calls balanceFinalizedTransaction with tokenKindsToBalance: 'all'
  // which simultaneously fills the swap imbalance and adds DUST for fees.
  console.log('\n=== Zswap-sponsor ===');

  const addrA = shieldedAddrOf(ctxA);

  // Step 1 — Wallet A initiates the swap.
  console.log('  Wallet A: initSwap...');
  const swapRecipe = await ctxA.wallet.initSwap(
    { shielded: { [customToken]: OFFER_AMOUNT } },
    [{ type: 'shielded', outputs: [{ type: customToken, amount: WANT_AMOUNT, receiverAddress: addrA }] }],
    { shieldedSecretKeys: ctxA.shieldedSecretKeys, dustSecretKey: ctxA.dustSecretKey },
    { ttl: TTL(), payFees: false },
  );
  console.log('  Wallet A: finalizeRecipe...');
  const finalizedSwapTx = await ctxA.wallet.finalizeRecipe(swapRecipe);

  // Step 2 — Wallet C balances the swap and pays DUST fees atomically.
  console.log('  Wallet C: balanceFinalizedTransaction...');
  const walletCRecipe = await ctxC.wallet.balanceFinalizedTransaction(
    finalizedSwapTx,
    { shieldedSecretKeys: ctxC.shieldedSecretKeys, dustSecretKey: ctxC.dustSecretKey },
    { ttl: TTL(), tokenKindsToBalance: 'all' },
  );
  console.log('  Wallet C: finalizeRecipe...');
  const walletCFinalizedTx = await ctxC.wallet.finalizeRecipe(walletCRecipe);
  console.log('  Wallet C: submitTransaction...');
  const txId = await ctxC.wallet.submitTransaction(walletCFinalizedTx);

  console.log('  ✓ Zswap-sponsor tx submitted:', txId);
  await sleep(10_000);

  // ── 5. Final balances ─────────────────────────────────────────────────────
  // getBalancesAndAddresses waits for the wallet to re-sync after the tx confirms.
  console.log('\n=== Final balances (A -100 tokens, C +100 tokens, C paid DUST fees) ===');
  await showBalances('Wallet A', ctxA, GENESIS_MINT_WALLET_SEED_ONE);
  await showBalances('Wallet C', ctxC, GENESIS_MINT_WALLET_SEED_THREE);

  // ── 6. Cleanup ────────────────────────────────────────────────────────────
  await Promise.all([ctxA.wallet.stop(), ctxB.wallet.stop(), ctxC.wallet.stop()]);
};

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
