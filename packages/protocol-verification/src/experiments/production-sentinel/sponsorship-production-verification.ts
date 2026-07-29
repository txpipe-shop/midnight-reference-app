/**
 * Production sponsorship transaction flow:
 * 1. Deploy a target contract and a Sentinel contract whose sponsorship policy allows only the
 *    target's `interact` entry point, register one eligible reward delegator, then fund the
 *    DUST-free beneficiary with exact NIGHT coins.
 * 2. Build the target contract's `interact(expiry)` call before proof generation. Pass the call's
 *    cryptographic commitment to Sentinel's `deliverSponsorReward` call so the resulting receipt
 *    identifies the exact target interaction covered by the sponsorship.
 * 3. Build one ordered intent containing the guaranteed `purchaseDelegatorReward`, fallible
 *    `deliverSponsorReward`, and checkpointed target calls; prove it, have the beneficiary balance
 *    and sign its NIGHT effects, and serialize the finalized transaction without DUST.
 * 4. Have the sponsor inspect the serialized request against its allowlist and campaign policy,
 *    estimate the fee, attach only the required DUST funding, verify that the committed request
 *    was not changed, and submit the transaction.
 * 5. Run one transaction before target expiry and one after expiry, then verify that both record
 *    guaranteed sponsorship purchases while only the first executes the target's fallible effects.
 */
import {
  CompositeTargetCompiledContract,
  compositeTargetLedger,
  type CompositeTargetContractType,
} from '../composite-sponsorship/composite-sponsorship-contract.js';
import { ledger as sentinelLedger, type SentinelContractType } from '@midnight-sentinel/contract';
import { SentinelContract } from '@midnight-sentinel/api';
import {
  sponsorshipAllowlistHash,
  type SponsorshipPolicy,
} from '@midnight-sentinel/api/sponsorship';
import {
  createMidnightBeneficiarySponsorshipApi,
  createMidnightSponsorSponsorshipApi,
  createMidnightSponsorshipTarget,
  nativeNightSponsorshipConfig,
} from '@midnight-sentinel/api/sponsorship/midnight';
import { buildUnfundedWallet, buildWallet, type WalletContext } from '@midnight-sentinel/wallet';
import {
  ContractCall,
  PreProof,
  shieldedToken,
  type ZswapLocalState,
} from '@midnight-ntwrk/ledger-v8';
import { createUnprovenCallTx, deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import * as Rx from 'rxjs';
import { packagePath, standaloneConfig } from '../../common/config.js';
import {
  GENESIS_MINT_WALLET_SEED_ONE,
  GENESIS_MINT_WALLET_SEED_THREE,
} from '../../common/constants.js';
import {
  filledBytes,
  providersFor,
  stopWallets,
  withTimeout,
  waitForWallClock,
  waitForWalletState,
  waitForWalletSync,
  writeJsonReport,
} from '../../common/experiment-harness.js';

const SPONSOR_SHARE = 1n;
const DELEGATOR_SHARE = 1n;
const PAYMENT_COIN_COUNT = 4;
const TIMEOUT_MS = 360_000;
const BENEFICIARY_SEED = '42'.repeat(32);
const TEST_DELEGATOR_REWARD_ADDRESS = 'production-verification-delegator';
const TTL = () => new Date(Date.now() + 30 * 60_000);
const config = {
  ...standaloneConfig,
  indexer: 'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
  proofServer: 'http://127.0.0.1:6300',
};
const sentinelZkPath = packagePath('../contract/src/managed/sentinel');
const targetZkPath = packagePath('src/managed/composite-target');

const requireFullZkArtifacts = async () => {
  const required = [
    path.join(sentinelZkPath, 'keys/purchaseDelegatorReward.verifier'),
    path.join(sentinelZkPath, 'keys/setSponsorshipEnabled.verifier'),
    path.join(targetZkPath, 'keys/interact.verifier'),
  ];
  for (const artifact of required) {
    let size = 0;
    try {
      size = (await stat(artifact)).size;
    } catch {
      // Report the same actionable error for missing and empty artifacts.
    }
    if (size === 0) {
      throw new Error(
        `Missing full-ZK artifact ${artifact}; run "pnpm verify:protocol:devnet:production" from the repository root`
      );
    }
  }
};

const main = async () => {
  const wallets: WalletContext[] = [];
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
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
    verdict: 'inconclusive',
  };

  try {
    await requireFullZkArtifacts();
    const [deployer, sponsor, beneficiary] = await Promise.all([
      buildWallet(config, GENESIS_MINT_WALLET_SEED_ONE),
      buildWallet(config, GENESIS_MINT_WALLET_SEED_THREE),
      buildUnfundedWallet(config, BENEFICIARY_SEED),
    ]);
    wallets.push(deployer, sponsor, beneficiary);

    const deployTargetProviders = await providersFor<CompositeTargetContractType>(
      deployer,
      config,
      'production-verify-target-deploy',
      targetZkPath
    );
    const targetDeployment = await deployContract<CompositeTargetContractType>(
      deployTargetProviders,
      { compiledContract: CompositeTargetCompiledContract }
    );
    const targetAddress = targetDeployment.deployTxData.public.contractAddress;
    const allowedTargets = [{ address: targetAddress, entryPoint: 'interact' }];
    const policyHash = sponsorshipAllowlistHash(allowedTargets);

    const deploySentinelProviders = await providersFor<SentinelContractType>(
      deployer,
      config,
      'production-verify-sentinel-deploy',
      sentinelZkPath
    );
    const sentinel = await SentinelContract.deploy(
      deploySentinelProviders,
      nativeNightSponsorshipConfig(sponsor, policyHash, {
        sponsorShare: SPONSOR_SHARE,
        delegatorShare: DELEGATOR_SHARE,
        minimumRegisteredNight: 1n,
        initialEligibilityOperator: new Uint8Array(32),
      })
    );
    const sentinelAddress = sentinel.deployedContract!.deployTxData.public.contractAddress;
    const deployedSentinelState = await withTimeout(
      'deployed Sentinel state',
      TIMEOUT_MS,
      Rx.firstValueFrom(sentinel.state$)
    );
    await sentinel.rotateEligibilityOperator(
      Uint8Array.from(Buffer.from(deployedSentinelState.owner.slice(2), 'hex'))
    );
    const paddedRewardAddress = Buffer.alloc(96);
    paddedRewardAddress.write(TEST_DELEGATOR_REWARD_ADDRESS);
    await sentinel.addDelegator({
      identity: filledBytes(0x61),
      nightRewardAddress: paddedRewardAddress,
      rewardKey: Uint8Array.from(Buffer.from(beneficiary.shieldedSecretKeys.coinPublicKey, 'hex')),
      rewardEncryptionKey: Uint8Array.from(
        Buffer.from(beneficiary.shieldedSecretKeys.encryptionPublicKey, 'hex')
      ),
      registeredAmount: 1n,
      verificationBlock: 0n,
      enrollmentNonce: 1n,
    });
    await withTimeout(
      'Sentinel delegator registration',
      TIMEOUT_MS,
      Rx.firstValueFrom(sentinel.state$.pipe(Rx.filter((state) => state.delegatorCount === 1n)))
    );

    const beneficiaryAddressState = await waitForWalletSync(beneficiary, TIMEOUT_MS);
    const fundingRecipe = await deployer.wallet.transferTransaction(
      [
        {
          type: 'shielded',
          outputs: Array.from({ length: PAYMENT_COIN_COUNT }, () => ({
            type: shieldedToken().raw,
            amount: SPONSOR_SHARE,
            receiverAddress: beneficiaryAddressState.shielded.address,
          })),
        },
      ],
      {
        shieldedSecretKeys: deployer.shieldedSecretKeys,
        dustSecretKey: deployer.dustSecretKey,
      },
      { ttl: TTL() }
    );
    const funding = await deployer.wallet.finalizeRecipe(fundingRecipe);
    const fundingTxId = await deployer.wallet.submitTransaction(funding);
    await waitForWalletState('beneficiary funding', TIMEOUT_MS, beneficiary, (state) =>
      (state.shielded.balances[shieldedToken().raw] ?? 0n) >=
      SPONSOR_SHARE * BigInt(PAYMENT_COIN_COUNT)
        ? state
        : false
    );

    const targetProviders = await providersFor<CompositeTargetContractType>(
      beneficiary,
      config,
      'production-verify-target-beneficiary',
      targetZkPath
    );
    const beneficiarySentinelProviders = await providersFor<SentinelContractType>(
      beneficiary,
      config,
      'production-verify-sentinel-beneficiary',
      sentinelZkPath
    );
    await SentinelContract.join(beneficiarySentinelProviders, sentinelAddress);
    const sponsorSentinelProviders = await providersFor<SentinelContractType>(
      sponsor,
      config,
      'production-verify-sentinel-sponsor',
      sentinelZkPath
    );

    const policy: SponsorshipPolicy = {
      sentinelAddress,
      sponsorId: nativeNightSponsorshipConfig(sponsor, policyHash, {
        initialEligibilityOperator: new Uint8Array(32),
      }).sponsorId,
      sponsorDustAddress: '',
      registrationProvider: {
        async getStatus(nightRewardAddress) {
          return {
            nightRewardAddress,
            dustAddress: '',
            registered: true,
            nightBalance: 1n,
            finalizedBlock: 0n,
          };
        },
      },
      policyHash,
      allowedTargets,
      minTtlMs: 0,
      maxTtlMs: 65 * 60_000,
      maxFee: 1_000_000_000_000_000_000n,
    };
    const beneficiarySponsorshipApi = createMidnightBeneficiarySponsorshipApi({
      sentinelAddress,
      sentinelProviders: beneficiarySentinelProviders,
      beneficiary,
      proofServer: config.proofServer,
    });
    const sponsorSponsorshipApi = createMidnightSponsorSponsorshipApi({
      policy,
      sentinelProviders: sponsorSentinelProviders,
      sponsor,
    });

    const runScenario = async (
      purchaseId: Uint8Array,
      expiry: bigint,
      expectedStatus: 'SucceedEntirely' | 'FailFallible'
    ) => {
      const before = await waitForWalletSync(beneficiary, TIMEOUT_MS);
      assert.equal(before.dust.balance(new Date()), 0n);
      const exactCoins = [...(before.shielded.state.state as ZswapLocalState).coins].filter(
        (coin) => coin.type === shieldedToken().raw && coin.value === SPONSOR_SHARE
      );
      assert(
        exactCoins.length >= 2,
        'two exact NIGHT payment coins are required for the sponsor and delegator shares'
      );

      const targetCall = await createUnprovenCallTx(targetProviders, {
        compiledContract: CompositeTargetCompiledContract,
        contractAddress: targetAddress,
        circuitId: 'interact',
        args: [expiry],
      });
      const targetCalls = [...(targetCall.private.unprovenTx.intents?.values() ?? [])]
        .flatMap((intent) => intent.actions)
        .filter((action): action is ContractCall<PreProof> => action instanceof ContractCall);
      assert.equal(targetCalls.length, 1);
      assert(targetCall.public.partitionedTranscript[0]);
      assert(targetCall.public.partitionedTranscript[1]);

      const prepared = await beneficiarySponsorshipApi.prepare({
        target: createMidnightSponsorshipTarget({
          targetCall,
          zkConfigProvider: targetProviders.zkConfigProvider,
        }),
        expiresAt: TTL(),
        purchaseId,
      });
      assert(prepared.transaction.length > 0);

      const targetCommitment = prepared.targetCommunicationCommitment;
      if (expectedStatus === 'FailFallible') {
        await waitForWallClock('target expiry', expiry, TIMEOUT_MS);
      }
      const inspected = await sponsorSponsorshipApi.inspect({
        transaction: prepared.transaction,
      });
      assert.equal(inspected.hasDust, false);
      const submitted = await sponsorSponsorshipApi.sponsorAndSubmit({
        transaction: prepared.transaction,
      });
      assert.equal(submitted.status, expectedStatus);
      assert.equal(submitted.targetCommunicationCommitment, targetCommitment);
      return {
        txId: submitted.txId,
        status: submitted.status,
        feeEstimate: submitted.feeEstimate.toString(),
        purchaseId: Buffer.from(submitted.purchaseId).toString('hex'),
        targetCommunicationCommitment: targetCommitment,
      };
    };

    const success = await runScenario(
      filledBytes(0x71),
      BigInt(Math.floor(Date.now() / 1000) + 900),
      'SucceedEntirely'
    );
    const fallibleExpiry = BigInt(Math.floor(Date.now() / 1000) + 90);
    const fallibleFailure = await runScenario(filledBytes(0x72), fallibleExpiry, 'FailFallible');

    const sentinelState = await withTimeout(
      'production Sentinel state',
      TIMEOUT_MS,
      Rx.firstValueFrom(
        sponsorSentinelProviders.publicDataProvider
          .contractStateObservable(sentinelAddress, { type: 'latest' })
          .pipe(
            Rx.map((state) => sentinelLedger(state.data)),
            Rx.filter((state) => state.sponsorshipPurchases === 2n)
          )
      )
    );
    const targetState = await withTimeout(
      'production target state',
      TIMEOUT_MS,
      Rx.firstValueFrom(
        targetProviders.publicDataProvider
          .contractStateObservable(targetAddress, { type: 'latest' })
          .pipe(
            Rx.map((state) => compositeTargetLedger(state.data)),
            Rx.filter(
              (state) => state.guaranteedExecutions === 2n && state.fallibleExecutions === 1n
            )
          )
      )
    );
    assert.equal(sentinelState.sponsorshipReceipts.size(), 2n);

    Object.assign(report, {
      finishedAt: new Date().toISOString(),
      verdict: 'confirmed',
      contractAddresses: { sentinel: sentinelAddress, target: targetAddress },
      transactionIds: {
        funding: fundingTxId,
        success: success.txId,
        fallibleFailure: fallibleFailure.txId,
      },
      scenarios: { success, fallibleFailure },
      postState: {
        sponsorshipRevenue: (
          sentinelState.sponsorshipPurchases * sentinelState.sponsorshipFixedPrice
        ).toString(),
        sponsorshipPurchases: sentinelState.sponsorshipPurchases.toString(),
        receiptCount: sentinelState.sponsorshipReceipts.size().toString(),
        targetGuaranteedExecutions: targetState.guaranteedExecutions.toString(),
        targetFallibleExecutions: targetState.fallibleExecutions.toString(),
      },
    });
  } catch (error) {
    Object.assign(report, {
      finishedAt: new Date().toISOString(),
      verdict: 'inconclusive',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    const reportPath =
      process.env.SPONSORSHIP_VERIFICATION_REPORT ??
      packagePath('src/experiments/production-sentinel/result.json');
    await writeJsonReport(reportPath, report);
    console.log(`Production sponsorship verification: ${String(report.verdict).toUpperCase()}`);
    console.log(`Report: ${reportPath}`);
    await stopWallets(wallets);
  }
};

await main();
