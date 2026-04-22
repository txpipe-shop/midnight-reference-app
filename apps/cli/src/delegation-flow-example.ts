/**
 * NIGHT Delegation & DUST Sponsorship Flow
 *
 * End-to-end scripted demonstration:
 *   1. Build 4 wallets (Admin, Delegator 1, Delegator 2, User)
 *   2. Admin deploys SentinelContract
 *   3. Mint custom tokens to User (will be used to pay for sponsorship)
 *   4. Delegator 1 delegates NIGHT
 *   5. Delegator 2 delegates NIGHT
 *   6. Admin withdraws shielded NIGHT from contract
 *   7. User sends tokens via zswap-sponsor (Admin pays DUST) in exchange for tokens
 *   8. Admin deposits rewards (tokens paid by user) into contract
 *   9. Delegator 1 redeems rewards
 *  10. Show final balances and cleanup
 *
 * Run: pnpm dev-delegation  (from apps/cli)
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
  MINT_WALLET_SEED_FOUR,
} from './utils/constants.js';
import Rx from 'rxjs';
import { encodeQualifiedShieldedCoinInfo, type ZswapLocalState } from '@midnight-ntwrk/ledger-v8';
import assert from 'assert';

// ── Constants ────────────────────────────────────────────────────────────────

/** Amount Delegator 1 locks in the contract. */
const DELEGATE_1_AMOUNT = 1_000n;

/** Amount Delegator 2 locks in the contract. */
const DELEGATE_2_AMOUNT = 2_000n;

/** Tokens User offers into the swap. */
const USER_OFFER = 300n;

/** Tokens User wants back (Admin nets OFFER - WANT = 100 tokens as fee). */
const USER_WANT = 100n;

/** Tokens User wants to send to Delegator 2 */
const DEL2_WANT = 100n;

/** Reward tokens Admin deposits for delegators. */
const REWARD_AMOUNT = 100n;

/** Rolling 30-minute TTL for all transactions. */
const TTL = () => new Date(Date.now() + 30 * 60 * 1_000);

/** Delay after each transaction to let the indexer catch up before querying balances. */
const SYNC_DELAY_MS = 10_000;

const sleep = (ms: number) => {
  console.log('Going sleep sleep');
  return new Promise<void>((r) => setTimeout(r, ms));
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a ShieldedAddress object from a wallet context. */
function shieldedAddrOf(ctx: WalletContext): ShieldedAddress {
  return new ShieldedAddress(
    ShieldedCoinPublicKey.fromHexString(ctx.shieldedSecretKeys.coinPublicKey),
    ShieldedEncryptionPublicKey.fromHexString(ctx.shieldedSecretKeys.encryptionPublicKey)
  );
}

/** Print balances for a single wallet, waiting for sync first. */
async function showBalances(label: string, ctx: WalletContext, seed: string): Promise<void> {
  console.log(`\n--- ${label} ---`);
  const { balances, addresses } = await getBalancesAndAddresses(ctx.wallet, seed);
  printBalances(balances, addresses);
}

async function getRawState(ctx: WalletContext) {
  return await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
}

function tokenTypeToQualified(state: ZswapLocalState, tokenType: string) {
  for (const coin of state.coins) {
    if (coin.type === tokenType) {
      return encodeQualifiedShieldedCoinInfo(coin);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const config = new StandaloneConfig();

const main = async () => {
  // ── 1. Build four wallets ─────────────────────────────────────────────────
  console.log('\n=== 1. Building wallets ===');
  const [admin, del1, del2, user] = await Promise.all([
    // These three wallets have both shielded and unshielded NIGHT and DUST
    buildWallet(config, GENESIS_MINT_WALLET_SEED_ONE), // Admin
    buildWallet(config, GENESIS_MINT_WALLET_SEED_TWO), // Delegator 1
    buildWallet(config, GENESIS_MINT_WALLET_SEED_THREE), // Delegator 2
    // Empty by default — we will mint tokens to this wallet
    buildWallet(config, MINT_WALLET_SEED_FOUR), // User
  ]);

  // ── 2. Initial balances ───────────────────────────────────────────────────
  console.log('\n=== 2. Initial balances ===');
  await showBalances('Admin', admin, GENESIS_MINT_WALLET_SEED_ONE);
  await showBalances('Delegator 1', del1, GENESIS_MINT_WALLET_SEED_TWO);
  await showBalances('Delegator 2', del2, GENESIS_MINT_WALLET_SEED_THREE);
  await showBalances('User', user, MINT_WALLET_SEED_FOUR);

  // ── 3. Admin deploys SentinelContract ─────────────────────────────────────
  console.log('\n=== 3. Admin deploys SentinelContract ===');
  const providers = await configureProviders(admin, config, 'delegation-contract');

  const contract = await SentinelContract.deploy(providers);
  console.log(
    '  ✓ Contract deployed at:',
    contract.deployedContract?.deployTxData.public.contractAddress
  );
  await sleep(SYNC_DELAY_MS);

  // ── 4. Mint custom tokens to User ─────────────────────────────────────────
  const userProvider = await configureProviders(user, config, 'delegation-contract');
  console.log('\n=== 4. Minting custom tokens to User ===');
  const contractAddress = contract.deployedContract?.deployTxData.public.contractAddress;
  if (!contractAddress) throw new Error('Contract address not found after deployment');
  const userContract = await SentinelContract.join(userProvider, contractAddress);

  const { balances: preMintUser } = await getBalancesAndAddresses(
    admin.wallet,
    MINT_WALLET_SEED_FOUR
  );
  const knownTokensAdmin = new Set(Object.keys(preMintUser.shielded));
  console.dir(Object.keys(preMintUser.shielded));

  await userContract.mintFreeToken(
    user.shieldedSecretKeys.coinPublicKey,
    user.shieldedSecretKeys.encryptionPublicKey
  );
  console.log('  ✓ Minted to User');
  await sleep(SYNC_DELAY_MS);

  const { balances: postMintUser } = await getBalancesAndAddresses(
    user.wallet,
    MINT_WALLET_SEED_FOUR
  );
  console.log(postMintUser.shielded);

  const customToken = Object.keys(postMintUser.shielded).find((k) => !knownTokensAdmin.has(k))!;
  if (!customToken) throw new Error('Custom token not found after minting');

  console.log('  Custom token type:', customToken);
  await showBalances('User', user, MINT_WALLET_SEED_FOUR);

  // ── 5. Delegator 1 delegates NIGHT ────────────────────────────────────────
  console.log('\n=== 5. Delegator 1 delegates NIGHT ===');
  const del1Providers = await configureProviders(del1, config, 'delegator-1');
  const del1Contract = await SentinelContract.join(
    del1Providers,
    contract.deployedContract!.deployTxData.public.contractAddress
  );

  await del1Contract.delegate(del1.shieldedSecretKeys.coinPublicKey, DELEGATE_1_AMOUNT);
  console.log('  ✓ Delegator 1 delegated', DELEGATE_1_AMOUNT);
  await sleep(SYNC_DELAY_MS);

  await showBalances('Delegator 1', del1, GENESIS_MINT_WALLET_SEED_TWO);

  // ── 6. Delegator 2 delegates NIGHT ────────────────────────────────────────
  console.log('\n=== 6. Delegator 2 delegates NIGHT ===');
  const del2Providers = await configureProviders(del2, config, 'delegator-2');
  const del2Contract = await SentinelContract.join(
    del2Providers,
    contract.deployedContract!.deployTxData.public.contractAddress
  );

  await del2Contract.delegate(del2.shieldedSecretKeys.coinPublicKey, DELEGATE_2_AMOUNT);
  console.log('  ✓ Delegator 2 delegated', DELEGATE_2_AMOUNT);
  await sleep(SYNC_DELAY_MS);

  await showBalances('Delegator 2', del2, GENESIS_MINT_WALLET_SEED_THREE);

  // ── 7. Admin withdraws shielded NIGHT from contract ───────────────────────
  console.log('\n=== 7. Admin withdraws shielded NIGHT from contract ===');
  const { addresses: adminAddresses } = await getBalancesAndAddresses(
    admin.wallet,
    GENESIS_MINT_WALLET_SEED_ONE
  );
  await contract.withdraw(adminAddresses.unshielded);
  console.log('  ✓ Admin withdrew NIGHT from contract');
  await sleep(SYNC_DELAY_MS);

  // ── 8. User sends tokens via zswap-sponsor (Admin pays DUST) ──────────────
  console.log('\n=== 8. User sends tokens (Admin sponsors DUST) ===');

  const addrUser = shieldedAddrOf(user);
  const addrDel2 = shieldedAddrOf(del2);

  // Step 8a — User initiates the swap (does NOT pay fees).
  console.log('  User: initSwap...');
  const userSwapRecipe = await user.wallet.initSwap(
    { shielded: { [customToken]: USER_OFFER } },
    [
      {
        type: 'shielded',
        outputs: [
          { type: customToken, amount: USER_WANT, receiverAddress: addrUser },
          { type: customToken, amount: DEL2_WANT, receiverAddress: addrDel2 },
        ],
      },
    ],
    { shieldedSecretKeys: user.shieldedSecretKeys, dustSecretKey: user.dustSecretKey },
    { ttl: TTL(), payFees: false }
  );
  console.log('  User: finalizeRecipe...');
  const userFinalizedSwap = await user.wallet.finalizeRecipe(userSwapRecipe);

  // Step 8b — Admin balances the swap and pays DUST fees atomically.
  console.log('  Admin: balanceFinalizedTransaction...');
  const adminRecipe = await admin.wallet.balanceFinalizedTransaction(
    userFinalizedSwap,
    { shieldedSecretKeys: admin.shieldedSecretKeys, dustSecretKey: admin.dustSecretKey },
    { ttl: TTL(), tokenKindsToBalance: 'all' }
  );
  console.log('  Admin: finalizeRecipe...');
  const adminFinalizedTx = await admin.wallet.finalizeRecipe(adminRecipe);
  console.log('  Admin: submitTransaction...');
  const sponsorTxId = await admin.wallet.submitTransaction(adminFinalizedTx);

  console.log('  ✓ Sponsored tx submitted:', sponsorTxId);
  await sleep(SYNC_DELAY_MS);

  await showBalances('User', user, MINT_WALLET_SEED_FOUR);
  await showBalances('Admin', admin, GENESIS_MINT_WALLET_SEED_ONE);
  await showBalances('Delegator 2', del2, GENESIS_MINT_WALLET_SEED_THREE);

  // ── 9. Admin deposits rewards into contract ──────────────────────────────
  console.log('\n=== 9. Admin deposits rewards into contract ===');
  const adminState = await getRawState(admin);
  const qualifiedCoin = tokenTypeToQualified(adminState.shielded.state.state, customToken);

  assert(qualifiedCoin, 'Did not find reward token');
  await contract.depositRewards(BigInt(REWARD_AMOUNT), qualifiedCoin.nonce, qualifiedCoin.color);
  console.log('  ✓ Rewards deposited');
  await sleep(SYNC_DELAY_MS);

  await showBalances('Admin', admin, GENESIS_MINT_WALLET_SEED_ONE);

  // ── 10. Delegator 1 redeems rewards ───────────────────────────────────────
  console.log('\n=== 10. Delegator 1 redeems rewards ===');
  await del1Contract.redeemRewards();
  console.log('  ✓ Delegator 1 redeemed rewards');
  await sleep(SYNC_DELAY_MS);

  await showBalances('Delegator 1', del1, GENESIS_MINT_WALLET_SEED_TWO);

  // ── 11. Final balances ────────────────────────────────────────────────────
  console.log('\n=== 11. Final balances ===');
  await showBalances('Admin', admin, GENESIS_MINT_WALLET_SEED_ONE);
  await showBalances('Delegator 1', del1, GENESIS_MINT_WALLET_SEED_TWO);
  await showBalances('Delegator 2', del2, GENESIS_MINT_WALLET_SEED_THREE);
  await showBalances('User', user, MINT_WALLET_SEED_FOUR);

  // ── 12. Cleanup ───────────────────────────────────────────────────────────
  console.log('\n=== 12. Cleanup ===');
  await Promise.all([
    admin.wallet.stop(),
    del1.wallet.stop(),
    del2.wallet.stop(),
    user.wallet.stop(),
  ]);
};

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
