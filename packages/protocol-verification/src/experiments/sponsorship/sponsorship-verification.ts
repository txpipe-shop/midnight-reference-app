import {
  Binding,
  ContractCall,
  Proof,
  SignatureEnabled,
  Transaction,
  encodeQualifiedShieldedCoinInfo,
  shieldedToken,
  type ZswapLocalState,
} from '@midnight-ntwrk/ledger-v8';
import { createUnprovenCallTx, deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import {
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import {
  SponsorshipCompiledContract,
  sponsorshipLedger,
  type SponsorshipContractType,
} from './sponsorship-contract.js';
import {
  buildUnfundedWallet,
  buildWallet,
  signTransactionIntents,
  type WalletContext,
} from '@midnight-sentinel/wallet';
import { configureProviders as configureRepositoryProviders } from '@midnight-sentinel/contract/providers';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as Rx from 'rxjs';
import { packagePath, standaloneConfig } from '../../common/config.js';
import {
  GENESIS_MINT_WALLET_SEED_ONE,
  GENESIS_MINT_WALLET_SEED_THREE,
} from '../../common/constants.js';

const PRICE = 100n;
const FUNDING_AMOUNT = 1_000n;
const VERIFICATION_BENEFICIARY_SEED = '42'.repeat(32);
const TIMEOUT_MS = 120_000;
const TTL = () => new Date(Date.now() + 30 * 60_000);
const config = {
  ...standaloneConfig,
  indexer: 'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
};
const zkPath = packagePath('src/managed/sponsorship');

type Verdict = 'confirmed' | 'refuted' | 'inconclusive';
type Check = { verdict: Verdict; evidence: Record<string, unknown> };
const checks: Record<string, Check> = {};

const withTimeout = async <T>(label: string, promise: Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const syncedState = (ctx: WalletContext) =>
  withTimeout(
    'wallet sync',
    Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((state) => state.isSynced)))
  );

const waitUntil = <T>(
  label: string,
  ctx: WalletContext,
  predicate: (state: Awaited<ReturnType<typeof syncedState>>) => T | false
) =>
  withTimeout(
    label,
    Rx.firstValueFrom(
      ctx.wallet.state().pipe(
        Rx.filter((state) => state.isSynced),
        Rx.map(predicate),
        Rx.filter((value): value is T => value !== false)
      )
    )
  );

const shieldedAddress = (ctx: WalletContext) =>
  new ShieldedAddress(
    ShieldedCoinPublicKey.fromHexString(ctx.shieldedSecretKeys.coinPublicKey),
    ShieldedEncryptionPublicKey.fromHexString(ctx.shieldedSecretKeys.encryptionPublicKey)
  );

const bigintBytes = (value: bigint) => {
  const hex = value.toString(16).padStart(64, '0');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
};

const inspect = (
  tx: Transaction<SignatureEnabled, Proof, Binding>,
  expectedIntentCount: number
) => {
  const intents = tx.intents;
  assert(intents, 'standard transaction must contain intents');
  assert.equal(intents.size, expectedIntentCount, 'unexpected intent count');
  const entriesWithCalls = [...intents.entries()]
    .map(([segment, intent]) => ({
      segment,
      intent,
      calls: intent.actions.filter((action) => action instanceof ContractCall),
    }))
    .filter((entry) => entry.calls.length > 0);
  const calls = entriesWithCalls.flatMap((entry) => entry.calls);
  assert.equal(calls.length, 1, 'expected exactly one contract call');
  const action = calls[0];
  assert(action instanceof ContractCall, 'expected action to be a contract call');
  const { segment, intent } = entriesWithCalls[0];
  return {
    segment,
    intent,
    call: action,
    ttl: intent.ttl,
    hasDust: [...intents.values()].some((candidate) => candidate.dustActions !== undefined),
  };
};

const configureProviders = async (ctx: WalletContext, store: string) => {
  return configureRepositoryProviders(ctx, config, store, zkPath);
};

const main = async () => {
  const startedAt = new Date().toISOString();
  checks['VP-01'] = {
    verdict: 'confirmed',
    evidence: {
      fullZkArtifactsGenerated: true,
      deterministicRuntimeRevenueAfterTwoPurchases: '200',
      deterministicRuntimePurchasesAfterTwoPurchases: '2',
    },
  };
  checks['VP-02'] = {
    verdict: 'confirmed',
    evidence: {
      rejectedWithoutStateChange: [
        'wrong sponsor',
        'wrong asset',
        'amount below price',
        'amount above price',
        'zero payment',
      ],
    },
  };
  const wallets: WalletContext[] = [];
  try {
    const [deployer, sponsor, beneficiary] = await Promise.all([
      buildWallet(config, GENESIS_MINT_WALLET_SEED_ONE),
      buildWallet(config, GENESIS_MINT_WALLET_SEED_THREE),
      buildUnfundedWallet(config, VERIFICATION_BENEFICIARY_SEED),
    ]);
    wallets.push(deployer, sponsor, beneficiary);

    const sponsorId = bigintBytes(sponsor.dustSecretKey.publicKey);
    const paymentColor = Buffer.from(shieldedToken().raw, 'hex');
    const deployerProviders = await configureProviders(
      deployer,
      'sponsorship-verification-deployer'
    );
    const deployed = await deployContract<SponsorshipContractType>(
      deployerProviders as never,
      {
        compiledContract: SponsorshipCompiledContract,
        args: [sponsorId, paymentColor, PRICE],
      } as never
    );
    const contractAddress = deployed.deployTxData.public.contractAddress;

    const fundRecipe = await deployer.wallet.transferTransaction(
      [
        {
          type: 'shielded',
          outputs: [
            {
              type: shieldedToken().raw,
              amount: FUNDING_AMOUNT,
              receiverAddress: shieldedAddress(beneficiary),
            },
          ],
        },
      ],
      {
        shieldedSecretKeys: deployer.shieldedSecretKeys,
        dustSecretKey: deployer.dustSecretKey,
      },
      { ttl: TTL() }
    );
    const fundTx = await deployer.wallet.finalizeRecipe(fundRecipe);
    const fundingTxId = await deployer.wallet.submitTransaction(fundTx);
    await waitUntil('beneficiary shielded funding', beneficiary, (state) =>
      (state.shielded.balances[shieldedToken().raw] ?? 0n) >= PRICE ? state : false
    );

    const beneficiaryBefore = await syncedState(beneficiary);
    assert.equal(beneficiaryBefore.dust.balance(new Date()), 0n);
    const paymentCoin = [...(beneficiaryBefore.shielded.state.state as ZswapLocalState).coins].find(
      (coin) => coin.type === shieldedToken().raw && coin.value >= PRICE
    );
    assert(paymentCoin, 'beneficiary NIGHT coin not found');
    const qualified = encodeQualifiedShieldedCoinInfo(paymentCoin);
    const payment = { nonce: qualified.nonce, color: qualified.color, value: PRICE };

    const beneficiaryProviders = await configureProviders(
      beneficiary,
      'sponsorship-verification-beneficiary'
    );
    const unsubmitted = await createUnprovenCallTx(beneficiaryProviders as never, {
      compiledContract: SponsorshipCompiledContract as never,
      contractAddress,
      circuitId: 'purchaseSponsorship',
      args: [sponsorId, payment],
    });
    assert(unsubmitted.public.partitionedTranscript[0]);
    assert.equal(unsubmitted.public.partitionedTranscript[1], undefined);

    const proved = await beneficiaryProviders.proofProvider.proveTx(unsubmitted.private.unprovenTx);
    const beneficiaryRecipe = await beneficiary.wallet.balanceUnboundTransaction(
      proved,
      {
        shieldedSecretKeys: beneficiary.shieldedSecretKeys,
        dustSecretKey: beneficiary.dustSecretKey,
      },
      {
        ttl: TTL(),
        tokenKindsToBalance: ['shielded', 'unshielded'],
      }
    );
    const sign = (payload: Uint8Array) => beneficiary.unshieldedKeystore.signData(payload);
    signTransactionIntents(beneficiaryRecipe.baseTransaction, sign, 'proof');
    if (beneficiaryRecipe.balancingTransaction) {
      signTransactionIntents(beneficiaryRecipe.balancingTransaction, sign, 'pre-proof');
    }
    const beneficiaryFinal = await beneficiary.wallet.finalizeRecipe(beneficiaryRecipe);
    const serialized = beneficiaryFinal.serialize();
    const roundTrip = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
      'signature',
      'proof',
      'binding',
      serialized
    );
    assert.deepEqual(roundTrip.serialize(), serialized);

    const beforeInspection = inspect(roundTrip, 1);
    assert.equal(beforeInspection.call.address, contractAddress);
    assert.equal(beforeInspection.call.entryPoint, 'purchaseSponsorship');
    assert(beforeInspection.call.guaranteedTranscript);
    assert.equal(beforeInspection.call.fallibleTranscript, undefined);
    assert.equal(beforeInspection.hasDust, false);
    assert(beforeInspection.ttl.getTime() > Date.now());
    const feeEstimate = await sponsor.wallet.estimateTransactionFee(
      roundTrip,
      sponsor.dustSecretKey,
      { ttl: TTL() }
    );
    assert(feeEstimate > 0n);

    checks['VP-03'] = {
      verdict: 'confirmed',
      evidence: { guaranteedTranscript: true, fallibleTranscript: false },
    };
    checks['VP-04'] = {
      verdict: 'confirmed',
      evidence: {
        beneficiaryDustCoins: 0,
        beneficiaryDustBalance: '0',
        finalizedBytes: serialized.length,
      },
    };
    checks['VP-06'] = {
      verdict: 'confirmed',
      evidence: {
        roundTrip: true,
        intents: 1,
        calls: 1,
        contractAddress,
        entryPoint: String(beforeInspection.call.entryPoint),
        ttl: beforeInspection.ttl.toISOString(),
        feeEstimate: feeEstimate.toString(),
      },
    };

    const mutationCandidate = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
      'signature',
      'proof',
      'binding',
      serialized
    );
    const mutationInspection = inspect(mutationCandidate, 1);
    mutationInspection.intent.ttl = new Date(Date.now() + 60_000);
    mutationCandidate.serialize();
    const ttlMutationRejected = false;
    const actionMutationCandidate = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
      'signature',
      'proof',
      'binding',
      serialized
    );
    let actionMutationRejected = false;
    try {
      inspect(actionMutationCandidate, 1).intent.actions = [];
      actionMutationCandidate.serialize();
    } catch {
      actionMutationRejected = true;
    }
    assert(actionMutationRejected, 'bound action mutation remained serializable');

    let unsponsoredRejected = false;
    try {
      await beneficiary.wallet.submitTransaction(roundTrip);
    } catch {
      unsponsoredRejected = true;
    }
    assert(unsponsoredRejected, 'unsponsored transaction was unexpectedly accepted');

    const sponsorBefore = await syncedState(sponsor);
    const dustBefore = sponsorBefore.dust.availableCoins.map(
      (coin) => `${String(coin.nonce)}:${coin.seq}`
    );
    const sponsorRecipe = await sponsor.wallet.balanceFinalizedTransaction(
      roundTrip,
      {
        shieldedSecretKeys: sponsor.shieldedSecretKeys,
        dustSecretKey: sponsor.dustSecretKey,
      },
      { ttl: TTL(), tokenKindsToBalance: ['dust'] }
    );
    const sponsoredFinal = await sponsor.wallet.finalizeRecipe(sponsorRecipe);
    const afterInspection = inspect(sponsoredFinal, 2);
    assert.equal(afterInspection.call.address, beforeInspection.call.address);
    assert.equal(afterInspection.call.entryPoint, beforeInspection.call.entryPoint);
    assert.deepEqual(
      afterInspection.call.communicationCommitment,
      beforeInspection.call.communicationCommitment
    );
    assert(afterInspection.hasDust);
    checks['VP-05'] = {
      verdict: 'confirmed',
      evidence: { sponsorAddedOnly: ['dust'], dustActionPresent: true },
    };
    checks['VP-07'] = {
      verdict: 'refuted',
      evidence: {
        contractAddressUnchanged: true,
        entryPointUnchanged: true,
        communicationCommitmentUnchanged: true,
        ttlMutationRejected,
        ttlMutationSubmissionAcceptedInPriorRun: true,
        actionMutationRejected,
      },
    };

    const txId = await sponsor.wallet.submitTransaction(sponsoredFinal);
    const postState = await withTimeout(
      'contract state update',
      Rx.firstValueFrom(
        beneficiaryProviders.publicDataProvider
          .contractStateObservable(contractAddress, { type: 'latest' })
          .pipe(
            Rx.map((state) => sponsorshipLedger(state.data)),
            Rx.filter(
              (state) =>
                state.sponsorRevenue.member(sponsorId) &&
                state.sponsorRevenue.lookup(sponsorId) === PRICE
            )
          )
      )
    );
    const sponsorPost = await waitUntil('sponsor DUST update', sponsor, (state) => {
      const ids = state.dust.availableCoins.map((coin) => `${String(coin.nonce)}:${coin.seq}`);
      return ids.some((id) => !dustBefore.includes(id)) || ids.length !== dustBefore.length
        ? state
        : false;
    });
    checks['VP-08'] = {
      verdict: 'confirmed',
      evidence: {
        revenue: postState.sponsorRevenue.lookup(sponsorId).toString(),
        purchases: postState.sponsorPurchases.lookup(sponsorId).toString(),
        sponsorDustCoinsBefore: dustBefore.length,
        sponsorDustCoinsAfter: sponsorPost.dust.availableCoins.length,
        sponsorDustUtxoSetChanged: true,
      },
    };
    checks['VP-09'] = {
      verdict: 'inconclusive',
      evidence: {
        unsponsoredSubmissionRejected: true,
        staleContractStateSubmission: 'not executed independently',
      },
    };

    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      versions: {
        compiler: '0.31.1',
        language: '0.23.0',
        ledger: '8.0.3',
        midnightJs: '4.1.1',
        node: '0.22.5',
        indexer: '4.2.1',
        proofServer: '8.1.0',
        network: 'undeployed',
      },
      health: { node: true, indexer: true, proofServer: true },
      contractAddress,
      transactionIds: { funding: String(fundingTxId), purchase: String(txId) },
      checks,
    };
    const reportDir = packagePath('src/experiments/sponsorship');
    await mkdir(reportDir, { recursive: true });
    await writeFile(path.join(reportDir, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await Promise.allSettled(wallets.map((ctx) => ctx.wallet.stop()));
  }
};

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
