/*
 * Token vault demo
 *
 * Run: pnpm dev-vault (from apps/cli)
 */

import { SentinelContract } from '@midnight-sentinel/api';
import { createPrivateState } from '@midnight-sentinel/contract';
import { configureProviders } from '@midnight-sentinel/contract/providers';
import {
  buildWallet,
  getBalancesAndAddresses,
  printBalances,
  type WalletContext,
} from '@midnight-sentinel/wallet';
import { StandaloneConfig } from './config.js';
import { fromHex } from '@midnight-ntwrk/compact-runtime';
import {
  GENESIS_MINT_WALLET_SEED_ONE,
  GENESIS_MINT_WALLET_SEED_TWO,
} from './utils/constants.js';
import { firstValueFrom, filter, map } from 'rxjs';

// ── Constants ────────────────────────────────────────────────────────────────

/** Amount to mint and then deposit into the vault */
const DEPOSIT_AMOUNT = 200n;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function showBalances(label: string, ctx: WalletContext, seed: string): Promise<void> {
  console.log(`\n--- ${label} ---`);
  const { balances, addresses } = await getBalancesAndAddresses(ctx.wallet, seed);
  printBalances(balances, addresses);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const config = new StandaloneConfig();

const main = async () => {
  // ── 1. Build wallets ──────────────────────────────────────────────────────
  console.log('\n=== Building wallets ===');
  const [ctxA, ctxB] = await Promise.all([
    buildWallet(config, GENESIS_MINT_WALLET_SEED_ONE),
    buildWallet(config, GENESIS_MINT_WALLET_SEED_TWO),
  ]);

  // ── 2. Initial balances ───────────────────────────────────────────────────
  console.log('\n=== Initial balances ===');
  await showBalances('Wallet A', ctxA, GENESIS_MINT_WALLET_SEED_ONE);
  await showBalances('Wallet B', ctxB, GENESIS_MINT_WALLET_SEED_TWO);

  // ── 3. Deploy contract ────────────────────────────────────────────────────
  console.log('\n=== Deploying Token Vault contract ===');
  const providers = await configureProviders(ctxA, config, 'vault-contract');
  const contract = await SentinelContract.deploy(
    providers,
    createPrivateState(crypto.getRandomValues(new Uint8Array(32))),
  );
  console.log('  ✓ Contract deployed');

  // ── 4. Capture Wallet A's coin public key and known token colors ──────────
  const walletAState = await firstValueFrom(
    ctxA.wallet.state().pipe(filter((s) => s.isSynced))
  );
  const coinPubKeyHex = walletAState.shielded.coinPublicKey.toHexString();

  // Snapshot existing colors so we can detect the freshly minted one later.
  const knownColors = new Set(Object.keys(walletAState.shielded.balances));

  // ── 5. Mint shielded tokens to Wallet A ───────────────────────────────────
  //
  // We keep mintNonce ourselves — it becomes the nonce field of the resulting
  // coin and we need it again when building ShieldedCoinInfo for depositShielded.
  console.log('\n=== Minting shielded tokens to Wallet A ===');
  const domainSep = new Uint8Array(32).fill(1);
  const mintNonce = crypto.getRandomValues(new Uint8Array(32));

  await contract.deployedContract?.callTx.mintDirectShielded(
    domainSep,
    DEPOSIT_AMOUNT,
    mintNonce,
    { bytes: fromHex(coinPubKeyHex) },
  );
  console.log('  ✓ Mint transaction submitted');

  // ── 6. Wait for the new coin to arrive in Wallet A ────────────────────────
  console.log('  Waiting for shielded coin to arrive in wallet...');
  const newColorHex = await firstValueFrom(
    ctxA.wallet.state().pipe(
      filter((s) => s.isSynced),
      map((s) =>
        Object.keys(s.shielded.balances as Record<string, bigint>).find(
          (k) => !knownColors.has(k)
        )
      ),
      filter((color): color is string => color !== undefined),
    )
  );
  console.log(`  ✓ New token color: ${newColorHex}`);

  console.log('\n=== Balances after minting ===');
  await showBalances('Wallet A', ctxA, GENESIS_MINT_WALLET_SEED_ONE);

  // ── 7. Deposit the shielded coin into the vault ───────────────────────────
  //
  // ShieldedCoinInfo describes the coin the wallet will spend:
  //   nonce  — the nonce we passed to mintDirectShielded
  //   color  — token type, resolved from the wallet balance above
  //   value  — amount
  //
  // Note: requires the compact-runtime patch that fixes ShieldedCoinInfo.value
  // alignment (8 → 16 bytes). See bug-report-receive-shielded.md.
  console.log('\n=== Depositing shielded tokens into vault ===');
  const tx = await contract.deployedContract?.callTx.depositShielded({
    nonce: mintNonce,
    color: fromHex(newColorHex),
    value: DEPOSIT_AMOUNT,
  });
  console.log(`  ✓ Deposit submitted. Tx Hash: ${tx?.public.txHash}`);

  // ── 8. Final balances ─────────────────────────────────────────────────────
  console.log('\n=== Final balances ===');
  await showBalances('Wallet A', ctxA, GENESIS_MINT_WALLET_SEED_ONE);
  await showBalances('Wallet B', ctxB, GENESIS_MINT_WALLET_SEED_TWO);

  // ── 9. Cleanup ────────────────────────────────────────────────────────────
  await Promise.all([ctxA.wallet.stop(), ctxB.wallet.stop()]);
};

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
