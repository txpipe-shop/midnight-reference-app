import {
  CompositeTargetCompiledContract,
  compositeTargetLedger,
  type CompositeTargetContractType,
} from '@midnight-sentinel/contract/verification/composite-sponsorship';
import {
  CompactCompiledContract,
  ledger as sentinelLedger,
} from '@midnight-sentinel/contract';
import { configureProviders as configureRepositoryProviders } from '@midnight-sentinel/contract/providers';
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
import {
  buildUnfundedWallet,
  buildWallet,
  type WalletContext,
} from '@midnight-sentinel/wallet';
import {
  ContractCall,
  PreProof,
  shieldedToken,
  type ZswapLocalState,
} from '@midnight-ntwrk/ledger-v8';
import { createUnprovenCallTx, deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import assert from 'node:assert/strict';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Rx from 'rxjs';
import { StandaloneConfig } from '../config.js';
import {
  GENESIS_MINT_WALLET_SEED_ONE,
  GENESIS_MINT_WALLET_SEED_THREE,
} from '../utils/constants.js';

const PRICE = 100n;
const TIMEOUT_MS = 360_000;
const BENEFICIARY_SEED = '42'.repeat(32);
const TTL = () => new Date(Date.now() + 30 * 60_000);
const config = Object.assign(new StandaloneConfig(), {
  indexer: 'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
  proofServer: 'http://127.0.0.1:6300',
});
const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/contract'
);
const sentinelZkPath = path.join(packageDir, 'src/managed/sentinel');
const targetZkPath = path.join(packageDir, 'src/managed/composite-target');

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

const waitForWallClock = (unixSeconds: bigint) =>
  withTimeout(
    'target expiry',
    new Promise<void>((resolve) => {
      const check = () => {
        if (BigInt(Math.floor(Date.now() / 1000)) > unixSeconds) resolve();
        else setTimeout(check, 250);
      };
      check();
    })
  );

const configure = (ctx: WalletContext, store: string, zkPath: string) =>
  configureRepositoryProviders(ctx, config, store, zkPath);

const bytes32 = (fill: number) => new Uint8Array(32).fill(fill);

const requireFullZkArtifacts = async () => {
  const required = [
    path.join(sentinelZkPath, 'keys/purchaseSponsorship.verifier'),
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
        `Missing full-ZK artifact ${artifact}; run "pnpm --dir packages/contract verify:sponsorship:production" from the repository root`
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

    const deployTargetProviders = await configure(
      deployer,
      'production-verify-target-deploy',
      targetZkPath
    );
    const targetDeployment = await deployContract<CompositeTargetContractType>(
      deployTargetProviders as never,
      { compiledContract: CompositeTargetCompiledContract } as never
    );
    const targetAddress = targetDeployment.deployTxData.public.contractAddress;
    const allowedTargets = [{ address: targetAddress, entryPoint: 'interact' }];
    const policyHash = sponsorshipAllowlistHash(allowedTargets);

    const deploySentinelProviders = await configure(
      deployer,
      'production-verify-sentinel-deploy',
      sentinelZkPath
    );
    const sentinel = await SentinelContract.deploy(
      deploySentinelProviders,
      nativeNightSponsorshipConfig(sponsor, policyHash, {
        sponsorShare: 1n,
        delegatorShare: 1n,
        minimumRegisteredNight: 1n,
        initialEligibilityOperator: new Uint8Array(32),
      })
    );
    const sentinelAddress = sentinel.deployedContract!.deployTxData.public.contractAddress;

    const beneficiaryAddressState = await syncedState(beneficiary);
    const fundingRecipe = await deployer.wallet.transferTransaction(
      [
        {
          type: 'shielded',
          outputs: Array.from({ length: 3 }, () => ({
            type: shieldedToken().raw,
            amount: PRICE,
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
    await waitUntil('beneficiary funding', beneficiary, (state) =>
      (state.shielded.balances[shieldedToken().raw] ?? 0n) >= PRICE * 3n
        ? state
        : false
    );

    const targetProviders = await configure(
      beneficiary,
      'production-verify-target-beneficiary',
      targetZkPath
    );
    const beneficiarySentinelProviders = await configure(
      beneficiary,
      'production-verify-sentinel-beneficiary',
      sentinelZkPath
    );
    await SentinelContract.join(beneficiarySentinelProviders, sentinelAddress);
    const sponsorSentinelProviders = await configure(
      sponsor,
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
    const beneficiarySponsorshipApi =
      createMidnightBeneficiarySponsorshipApi({
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
      const before = await syncedState(beneficiary);
      assert.equal(before.dust.balance(new Date()), 0n);
      const exactCoins = [...(before.shielded.state.state as ZswapLocalState).coins].filter(
        (coin) => coin.type === shieldedToken().raw && coin.value === PRICE
      );
      assert(exactCoins.length > 0, 'exact sponsorship payment coin not found');

      const targetCall = await createUnprovenCallTx(targetProviders as never, {
        compiledContract: CompositeTargetCompiledContract as never,
        contractAddress: targetAddress,
        circuitId: 'interact',
        args: [expiry],
      });
      const targetCalls = [...(targetCall.private.unprovenTx.intents?.values() ?? [])]
        .flatMap((intent) => intent.actions)
        .filter(
          (action): action is ContractCall<PreProof> => action instanceof ContractCall
        );
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
      if (expectedStatus === 'FailFallible') await waitForWallClock(expiry);
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
      bytes32(0x71),
      BigInt(Math.floor(Date.now() / 1000) + 900),
      'SucceedEntirely'
    );
    const fallibleExpiry = BigInt(Math.floor(Date.now() / 1000) + 90);
    const fallibleFailure = await runScenario(
      bytes32(0x72),
      fallibleExpiry,
      'FailFallible'
    );

    const sentinelState = await withTimeout(
      'production Sentinel state',
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
      Rx.firstValueFrom(
        targetProviders.publicDataProvider
          .contractStateObservable(targetAddress, { type: 'latest' })
          .pipe(
            Rx.map((state) => compositeTargetLedger(state.data)),
            Rx.filter(
              (state) =>
                state.guaranteedExecutions === 2n &&
                state.fallibleExecutions === 1n
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
      path.join(
        packageDir,
        'verification/results/sponsorship-production-verification.json'
      );
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Production sponsorship verification: ${String(report.verdict).toUpperCase()}`);
    console.log(`Report: ${reportPath}`);
    await Promise.allSettled(wallets.map((wallet) => wallet.wallet.stop()));
  }
};

await main();
