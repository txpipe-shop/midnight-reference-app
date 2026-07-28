import {
  Binding,
  ContractCall,
  PreProof,
  Proof,
  SignatureEnabled,
  Transaction,
  encodeQualifiedShieldedCoinInfo,
  entryPointHash,
  shieldedToken,
  type ZswapLocalState,
} from '@midnight-ntwrk/ledger-v8';
import type { Contract as CompactContract } from '@midnight-ntwrk/compact-js';
import { createUnprovenCallTx, deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import {
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import {
  CompositeSponsorshipCompiledContract,
  CompositeTargetCompiledContract,
  compositeProofProvider,
  compositeSponsorshipLedger,
  compositeTargetLedger,
  type CompositeSponsorshipContractType,
  type CompositeTargetContractType,
} from './composite-sponsorship-contract.js';
import { configureProviders as configureRepositoryProviders } from '@midnight-sentinel/contract/providers';
import {
  buildUnfundedWallet,
  buildWallet,
  signTransactionIntents,
  type WalletContext,
} from '@midnight-sentinel/wallet';
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
const TRANSFER_AMOUNT = 25n;
const FUNDING_COIN = 500n;
const TIMEOUT_MS = 300_000;
const BENEFICIARY_SEED = '42'.repeat(32);
const RECIPIENT_SEED = '43'.repeat(32);
const TTL = () => new Date(Date.now() + 30 * 60_000);
const config = {
  ...standaloneConfig,
  indexer: 'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
};
const sponsorshipZkPath = packagePath('src/managed/composite-sponsorship');
const targetZkPath = packagePath('src/managed/composite-target');

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
    'target application expiry',
    new Promise<void>((resolve) => {
      const check = () => {
        if (BigInt(Math.floor(Date.now() / 1000)) > unixSeconds) resolve();
        else setTimeout(check, 250);
      };
      check();
    })
  );

const shieldedAddress = (ctx: WalletContext) =>
  new ShieldedAddress(
    ShieldedCoinPublicKey.fromHexString(ctx.shieldedSecretKeys.coinPublicKey),
    ShieldedEncryptionPublicKey.fromHexString(ctx.shieldedSecretKeys.encryptionPublicKey)
  );

const bytes32 = (byte: number) => new Uint8Array(32).fill(byte);
const bigintBytes = (value: bigint) =>
  Uint8Array.from(Buffer.from(value.toString(16).padStart(64, '0'), 'hex'));
const callsOf = (tx: Transaction<SignatureEnabled, Proof, Binding>) =>
  [...(tx.intents?.values() ?? [])].flatMap((intent) =>
    intent.actions.filter((action): action is ContractCall<Proof> => action instanceof ContractCall)
  );

const transcriptShape = (callData: {
  public: {
    publicTranscript: unknown[];
    partitionedTranscript: [unknown | undefined, unknown | undefined];
  };
}) => ({
  rawOperations: callData.public.publicTranscript.map((operation) =>
    typeof operation === 'string' ? operation : Object.keys(operation as object)[0]
  ),
  guaranteedPresent: callData.public.partitionedTranscript[0] !== undefined,
  falliblePresent: callData.public.partitionedTranscript[1] !== undefined,
  guaranteed: callData.public.partitionedTranscript[0]?.toString(),
  fallible: callData.public.partitionedTranscript[1]?.toString(),
});

const hasDust = (tx: Transaction<SignatureEnabled, Proof, Binding>) =>
  [...(tx.intents?.values() ?? [])].some((intent) => intent.dustActions !== undefined);

const configure = async <C extends CompactContract.Any>(
  ctx: WalletContext,
  store: string,
  zkPath: string
) => configureRepositoryProviders<C>(ctx, config, store, zkPath);

const main = async () => {
  const startedAt = new Date().toISOString();
  const wallets: WalletContext[] = [];
  const report: Record<string, unknown> = {
    startedAt,
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
    const [deployer, sponsor, beneficiary, recipient] = await Promise.all([
      buildWallet(config, GENESIS_MINT_WALLET_SEED_ONE),
      buildWallet(config, GENESIS_MINT_WALLET_SEED_THREE),
      buildUnfundedWallet(config, BENEFICIARY_SEED),
      buildUnfundedWallet(config, RECIPIENT_SEED),
    ]);
    wallets.push(deployer, sponsor, beneficiary, recipient);

    const sponsorId = bigintBytes(sponsor.dustSecretKey.publicKey);
    const paymentColor = Buffer.from(shieldedToken().raw, 'hex');
    const deploySponsorshipProviders = await configure<CompositeSponsorshipContractType>(
      deployer,
      'composite-deploy-sponsorship',
      sponsorshipZkPath
    );
    const deployTargetProviders = await configure<CompositeTargetContractType>(
      deployer,
      'composite-deploy-target',
      targetZkPath
    );

    const sponsorshipDeployment = await deployContract<CompositeSponsorshipContractType>(
      deploySponsorshipProviders,
      {
        compiledContract: CompositeSponsorshipCompiledContract,
        args: [sponsorId, paymentColor, PRICE],
      }
    );
    const targetDeployment = await deployContract<CompositeTargetContractType>(
      deployTargetProviders,
      { compiledContract: CompositeTargetCompiledContract }
    );
    const sponsorshipAddress = sponsorshipDeployment.deployTxData.public.contractAddress;
    const targetAddress = targetDeployment.deployTxData.public.contractAddress;

    const fundingRecipe = await deployer.wallet.transferTransaction(
      [
        {
          type: 'shielded',
          outputs: Array.from({ length: 4 }, () => ({
            type: shieldedToken().raw,
            amount: FUNDING_COIN,
            receiverAddress: shieldedAddress(beneficiary),
          })),
        },
      ],
      {
        shieldedSecretKeys: deployer.shieldedSecretKeys,
        dustSecretKey: deployer.dustSecretKey,
      },
      { ttl: TTL() }
    );
    const fundingTx = await deployer.wallet.finalizeRecipe(fundingRecipe);
    const fundingTxId = await deployer.wallet.submitTransaction(fundingTx);
    await waitUntil('beneficiary funding', beneficiary, (state) =>
      (state.shielded.balances[shieldedToken().raw] ?? 0n) >= FUNDING_COIN * 4n ? state : false
    );

    const sponsorshipProviders = await configure<CompositeSponsorshipContractType>(
      beneficiary,
      'composite-beneficiary-sponsorship',
      sponsorshipZkPath
    );
    const targetProviders = await configure<CompositeTargetContractType>(
      beneficiary,
      'composite-beneficiary-target',
      targetZkPath
    );
    const proofProvider = compositeProofProvider(
      config.proofServer,
      sponsorshipZkPath,
      targetZkPath
    );

    const runScenario = async (
      purchaseId: Uint8Array,
      expiry: bigint,
      expectedStatus: 'SucceedEntirely' | 'FailFallible'
    ) => {
      const before = await syncedState(beneficiary);
      assert.equal(before.dust.balance(new Date()), 0n);
      const paymentCoin = [...(before.shielded.state.state as ZswapLocalState).coins].find(
        (coin) => coin.type === shieldedToken().raw && coin.value >= PRICE
      );
      assert(paymentCoin, 'beneficiary payment coin not found');
      const qualified = encodeQualifiedShieldedCoinInfo(paymentCoin);
      const payment = { nonce: qualified.nonce, color: qualified.color, value: PRICE };

      const targetCallData = await createUnprovenCallTx(targetProviders, {
        compiledContract: CompositeTargetCompiledContract,
        contractAddress: targetAddress,
        circuitId: 'interact',
        args: [expiry],
      });
      const targetTranscript = transcriptShape(targetCallData);
      assert(
        targetTranscript.rawOperations.includes('ckpt'),
        'Compiled target transcript is missing the checkpoint opcode'
      );
      assert(
        targetTranscript.guaranteedPresent && targetTranscript.falliblePresent,
        `Ledger did not split the checkpointed target transcript: ${JSON.stringify(targetTranscript)}`
      );
      const targetPreCalls = [...(targetCallData.private.unprovenTx.intents?.values() ?? [])]
        .flatMap((intent) => intent.actions)
        .filter((action): action is ContractCall<PreProof> => action instanceof ContractCall);
      assert.equal(targetPreCalls.length, 1);
      const targetCommitment = targetPreCalls[0].communicationCommitment;
      const targetCommitmentBytes = Buffer.from(targetCommitment, 'hex');
      assert.equal(
        targetCommitmentBytes.length,
        33,
        'Unexpected communication commitment encoding length'
      );
      const epHash = entryPointHash('interact');

      const purchaseCallData = await createUnprovenCallTx(sponsorshipProviders, {
        compiledContract: CompositeSponsorshipCompiledContract,
        contractAddress: sponsorshipAddress,
        circuitId: 'purchaseSponsorship',
        args: [
          purchaseId,
          sponsorId,
          payment,
          Buffer.from(targetAddress, 'hex'),
          Buffer.from(epHash, 'hex'),
          targetCommitmentBytes,
        ],
      });
      assert(purchaseCallData.public.partitionedTranscript[0]);
      assert.equal(purchaseCallData.public.partitionedTranscript[1], undefined);

      const transferRecipe = await beneficiary.wallet.transferTransaction(
        [
          {
            type: 'shielded',
            outputs: [
              {
                type: shieldedToken().raw,
                amount: TRANSFER_AMOUNT,
                receiverAddress: shieldedAddress(recipient),
              },
            ],
          },
        ],
        {
          shieldedSecretKeys: beneficiary.shieldedSecretKeys,
          dustSecretKey: beneficiary.dustSecretKey,
        },
        { ttl: TTL(), payFees: false }
      );
      assert.equal(transferRecipe.type, 'UNPROVEN_TRANSACTION');

      const mergedUnproven = targetCallData.private.unprovenTx
        .merge(purchaseCallData.private.unprovenTx)
        .merge(transferRecipe.transaction);
      const proved = await proofProvider.proveTx(mergedUnproven);
      const beneficiaryRecipe = await beneficiary.wallet.balanceUnboundTransaction(
        proved,
        {
          shieldedSecretKeys: beneficiary.shieldedSecretKeys,
          dustSecretKey: beneficiary.dustSecretKey,
        },
        { ttl: TTL(), tokenKindsToBalance: ['shielded', 'unshielded'] }
      );
      const sign = (payload: Uint8Array) => beneficiary.unshieldedKeystore.signData(payload);
      signTransactionIntents(beneficiaryRecipe.baseTransaction, sign, 'proof');
      if (beneficiaryRecipe.balancingTransaction) {
        signTransactionIntents(beneficiaryRecipe.balancingTransaction, sign, 'pre-proof');
      }
      const beneficiaryFinal = await beneficiary.wallet.finalizeRecipe(beneficiaryRecipe);
      assert.equal(hasDust(beneficiaryFinal), false);
      const beforeCalls = callsOf(beneficiaryFinal);
      assert.equal(beforeCalls.length, 2);

      const targetBefore = beforeCalls.find((call) => call.address === targetAddress);
      const purchaseBefore = beforeCalls.find((call) => call.address === sponsorshipAddress);
      assert(targetBefore?.guaranteedTranscript && targetBefore.fallibleTranscript);
      assert(purchaseBefore?.guaranteedTranscript && !purchaseBefore.fallibleTranscript);
      assert.equal(targetBefore.communicationCommitment, targetCommitment);

      const serialized = beneficiaryFinal.serialize();
      const roundTrip = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
        'signature',
        'proof',
        'binding',
        serialized
      );
      assert.deepEqual(roundTrip.serialize(), serialized);
      const feeEstimate = await sponsor.wallet.estimateTransactionFee(
        roundTrip,
        sponsor.dustSecretKey,
        { ttl: TTL() }
      );
      assert(feeEstimate > 0n);

      const sponsorRecipe = await sponsor.wallet.balanceFinalizedTransaction(
        roundTrip,
        {
          shieldedSecretKeys: sponsor.shieldedSecretKeys,
          dustSecretKey: sponsor.dustSecretKey,
        },
        { ttl: TTL(), tokenKindsToBalance: ['dust'] }
      );
      const sponsored = await sponsor.wallet.finalizeRecipe(sponsorRecipe);
      assert(hasDust(sponsored));
      const afterCalls = callsOf(sponsored);
      assert.equal(afterCalls.length, 2);
      for (const beforeCall of beforeCalls) {
        const afterCall = afterCalls.find((call) => call.address === beforeCall.address);
        assert(afterCall);
        assert.equal(afterCall.entryPoint, beforeCall.entryPoint);
        assert.equal(afterCall.communicationCommitment, beforeCall.communicationCommitment);
      }

      if (expectedStatus === 'FailFallible') await waitForWallClock(expiry);
      const txId = await sponsor.wallet.submitTransaction(sponsored);
      const finalized = await withTimeout(
        'composite transaction finalization',
        sponsorshipProviders.publicDataProvider.watchForTxData(txId)
      );
      assert.equal(finalized.status, expectedStatus);

      return {
        txId,
        status: finalized.status,
        feeEstimate: feeEstimate.toString(),
        targetCommunicationCommitment: targetCommitment,
        purchaseCommunicationCommitment: purchaseBefore.communicationCommitment,
        intentsBeforeSponsorship: beneficiaryFinal.intents?.size ?? 0,
        intentsAfterSponsorship: sponsored.intents?.size ?? 0,
      };
    };

    const recipientBefore =
      (await syncedState(recipient)).shielded.balances[shieldedToken().raw] ?? 0n;
    const success = await runScenario(
      bytes32(0x51),
      BigInt(Math.floor(Date.now() / 1000) + 600),
      'SucceedEntirely'
    );
    await waitUntil('first recipient transfer', recipient, (state) =>
      (state.shielded.balances[shieldedToken().raw] ?? 0n) >= recipientBefore + TRANSFER_AMOUNT
        ? state
        : false
    );

    const failed = await runScenario(
      bytes32(0x52),
      BigInt(Math.floor(Date.now() / 1000) + 120),
      'FailFallible'
    );
    const recipientAfter = await waitUntil('second recipient transfer', recipient, (state) => {
      const balance = state.shielded.balances[shieldedToken().raw] ?? 0n;
      return balance >= recipientBefore + TRANSFER_AMOUNT * 2n ? balance : false;
    });

    const sponsorshipState = await withTimeout(
      'sponsorship state',
      Rx.firstValueFrom(
        sponsorshipProviders.publicDataProvider
          .contractStateObservable(sponsorshipAddress, { type: 'latest' })
          .pipe(
            Rx.map((state) => compositeSponsorshipLedger(state.data)),
            Rx.filter((state) => state.sponsorPurchases.lookup(sponsorId) === 2n)
          )
      )
    );
    const targetState = await withTimeout(
      'target state',
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

    assert.equal(sponsorshipState.sponsorRevenue.lookup(sponsorId), PRICE * 2n);
    assert.equal(sponsorshipState.sponsoredInteractions.size(), 2n);
    assert.equal(recipientAfter, recipientBefore + TRANSFER_AMOUNT * 2n);

    Object.assign(report, {
      finishedAt: new Date().toISOString(),
      verdict: 'confirmed',
      contractAddresses: { sponsorship: sponsorshipAddress, target: targetAddress },
      transactionIds: { funding: fundingTxId, success: success.txId, fallibleFailure: failed.txId },
      scenarios: { success, fallibleFailure: failed },
      postState: {
        sponsorRevenue: sponsorshipState.sponsorRevenue.lookup(sponsorId).toString(),
        sponsorPurchases: sponsorshipState.sponsorPurchases.lookup(sponsorId).toString(),
        receiptCount: sponsorshipState.sponsoredInteractions.size().toString(),
        targetGuaranteedExecutions: targetState.guaranteedExecutions.toString(),
        targetFallibleExecutions: targetState.fallibleExecutions.toString(),
        recipientIncrease: (recipientAfter - recipientBefore).toString(),
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
    const resultDir = packagePath('src/experiments/composite-sponsorship');
    await mkdir(resultDir, { recursive: true });
    await writeFile(path.join(resultDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Composite sponsorship verification: ${String(report.verdict).toUpperCase()}`);
    console.log(`Report: ${path.join(resultDir, 'result.json')}`);
    if (report.verdict === 'confirmed') {
      const postState = report.postState as Record<string, string>;
      console.log(
        `Observed: revenue=${postState.sponsorRevenue}, purchases=${postState.sponsorPurchases}, receipts=${postState.receiptCount}, target=${postState.targetGuaranteedExecutions} guaranteed/${postState.targetFallibleExecutions} fallible`
      );
    }
    await Promise.allSettled(wallets.map((ctx) => ctx.wallet.stop()));
  }
};

await main();
