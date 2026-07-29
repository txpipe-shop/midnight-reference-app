// The runner reuses the wallet package's pinned ledger runtime without adding
// a second copy to this package.
import {
  Binding,
  ContractCallPrototype,
  ContractState as LedgerContractState,
  Intent,
  LedgerParameters,
  Proof,
  SignatureEnabled,
  Transaction,
  ZswapChainState,
  communicationCommitmentRandomness,
  encodeQualifiedShieldedCoinInfo,
  shieldedToken,
  type ZswapLocalState,
  // @ts-expect-error the direct Node entry point has no adjacent declaration file.
} from '../../../../wallet/node_modules/@midnight-ntwrk/ledger-v8/midnight_ledger_wasm_fs.js';
import {
  ContractState,
  createCircuitContext,
  createConstructorContext,
} from '@midnight-ntwrk/compact-runtime';
import {
  createUnprovenCallTx,
  createUnprovenCallTxFromInitialStates,
  deployContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import {
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '../../../../wallet/node_modules/@midnight-ntwrk/wallet-sdk-address-format/dist/index.js';
import {
  buildUnfundedWallet,
  buildWallet,
  signTransactionIntents,
  type WalletContext,
} from '@midnight-sentinel/wallet';
import { createPrivateState } from '@midnight-sentinel/contract';
import {
  RewardSplitCompiledContract,
  RewardSplitContractConstructor,
  rewardSplitCompositeProofProvider,
  rewardSplitLedger,
  type RewardSplitContractType,
} from './reward-split-contract.js';
import {
  FallibleUserTargetCompiledContract,
  type FallibleUserTargetType,
} from './fallible-user-target-contract.js';
import assert from 'node:assert/strict';
import {
  filledBytes,
  providersFor,
  shieldedCoinKeyOf,
  stopWallets,
  withTimeout,
  waitForWalletState,
  waitForWalletSync,
} from '../../common/experiment-harness.js';

const OWNER_SECRET = filledBytes(0x09);
const BENEFICIARY_SEED = '77'.repeat(32);
const DEPLOYER_SEED = '00'.repeat(31) + '01';
const SPONSOR_SEED = '00'.repeat(31) + '03';
const DELEGATOR_SEED = '00'.repeat(31) + '02';
const PRICE = 2n;
const SHARE = 1n;
const TIMEOUT_MS = 180_000;
const PRIVATE_STATE_ID = 'rewardSplitVerificationPrivateState';
// DUST is time-valued. A distant TTL lets the wallet balance against DUST that
// has not accrued yet, which the node rejects at immediate submission with
// BalanceCheckOverspend (custom error 138). Proof generation is already
// complete when this TTL is created, so two minutes is ample for finalization.
const TTL = () => new Date(Date.now() + 2 * 60_000);
const zkPath = new URL('../../managed/reward-split', import.meta.url).pathname;
const targetZkPath = new URL('../../managed/fallible-user-target', import.meta.url).pathname;
const config = {
  privateStateStoreName: PRIVATE_STATE_ID,
  logDir: '/tmp/reward-split-wallet-check',
  zkConfigPath: zkPath,
  indexer: 'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
  node: 'http://127.0.0.1:9944',
  proofServer: 'http://127.0.0.1:6300',
};

const waitBalance = (label: string, ctx: WalletContext, minimum: bigint) =>
  waitForWalletState(label, TIMEOUT_MS, ctx, (state) =>
    (state.shielded.balances[shieldedToken().raw] ?? 0n) >= minimum ? state : false
  );

const address = (ctx: WalletContext) =>
  new ShieldedAddress(
    ShieldedCoinPublicKey.fromHexString(ctx.shieldedSecretKeys.coinPublicKey),
    ShieldedEncryptionPublicKey.fromHexString(ctx.shieldedSecretKeys.encryptionPublicKey)
  );

type CallData = Awaited<ReturnType<typeof createUnprovenCallTx>>;

const singleIntentTransaction = (
  calls: ReadonlyArray<{
    circuitId: string;
    contractAddress: string;
    initialContractState: ContractState;
    callData: CallData;
  }>
) => {
  let intent = Intent.new(TTL());
  let guaranteedOffer:
    | NonNullable<CallData['private']['unprovenTx']['guaranteedOffer']>
    | undefined;
  let fallibleOffer: NonNullable<CallData['private']['unprovenTx']['guaranteedOffer']> | undefined;

  for (const { circuitId, contractAddress, initialContractState, callData } of calls) {
    const ledgerState = LedgerContractState.deserialize(initialContractState.serialize());
    const operation = ledgerState.operation(circuitId);
    assert(operation, `operation ${circuitId} is missing`);
    intent = intent.addCall(
      new ContractCallPrototype(
        contractAddress,
        circuitId,
        operation,
        callData.public.partitionedTranscript[0],
        callData.public.partitionedTranscript[1],
        callData.private.privateTranscriptOutputs,
        callData.private.input,
        callData.private.output,
        communicationCommitmentRandomness(),
        circuitId
      )
    );

    const tx = callData.private.unprovenTx;
    if (tx.guaranteedOffer) {
      guaranteedOffer = guaranteedOffer
        ? guaranteedOffer.merge(tx.guaranteedOffer)
        : tx.guaranteedOffer;
    }
    for (const offer of tx.fallibleOffer?.values() ?? []) {
      fallibleOffer = fallibleOffer ? fallibleOffer.merge(offer) : offer;
    }
  }

  return Transaction.fromParts('undeployed', guaranteedOffer, fallibleOffer, intent);
};

const main = async () => {
  const wallets: WalletContext[] = [];
  try {
    const [deployer, dustSponsor, delegator, beneficiary] = await Promise.all([
      buildWallet(config, DEPLOYER_SEED),
      buildWallet(config, SPONSOR_SEED),
      buildWallet(config, DELEGATOR_SEED),
      buildUnfundedWallet(config, BENEFICIARY_SEED),
    ]);
    wallets.push(deployer, dustSponsor, delegator, beneficiary);

    const sponsorBefore = await waitForWalletSync(dustSponsor, TIMEOUT_MS);
    const delegatorBefore = await waitForWalletSync(delegator, TIMEOUT_MS);
    const beneficiaryBefore = await waitForWalletSync(beneficiary, TIMEOUT_MS);
    const sponsorBalanceBefore = sponsorBefore.shielded.balances[shieldedToken().raw] ?? 0n;
    const delegatorBalanceBefore = delegatorBefore.shielded.balances[shieldedToken().raw] ?? 0n;
    const beneficiaryBalanceBefore = beneficiaryBefore.shielded.balances[shieldedToken().raw] ?? 0n;

    const runtime = new RewardSplitContractConstructor({
      localSecretKey: ({ privateState }) => [privateState, privateState.secretKey],
    });
    const probe = runtime.initialState(
      createConstructorContext(
        createPrivateState(OWNER_SECRET),
        deployer.shieldedSecretKeys.coinPublicKey
      ),
      filledBytes(0x11),
      Buffer.from(shieldedToken().raw, 'hex'),
      shieldedCoinKeyOf(dustSponsor),
      SHARE,
      SHARE,
      1n,
      filledBytes(0)
    );
    const operatorKey = rewardSplitLedger(probe.currentContractState.data).owner;
    const deployerProviders = await providersFor<RewardSplitContractType>(
      deployer,
      config,
      'reward-split-wallet-deployer',
      zkPath
    );
    const deployed = await deployContract<RewardSplitContractType>(deployerProviders, {
      compiledContract: RewardSplitCompiledContract,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: createPrivateState(OWNER_SECRET),
      args: [
        filledBytes(0x11),
        Buffer.from(shieldedToken().raw, 'hex'),
        shieldedCoinKeyOf(dustSponsor),
        SHARE,
        SHARE,
        1n,
        operatorKey,
      ],
    });
    const contractAddress = deployed.deployTxData.public.contractAddress;
    const targetDeployProviders = await providersFor<FallibleUserTargetType>(
      deployer,
      config,
      'reward-split-target-deployer',
      targetZkPath
    );
    const targetDeployment = await deployContract<FallibleUserTargetType>(targetDeployProviders, {
      compiledContract: FallibleUserTargetCompiledContract,
    });
    const targetAddress = targetDeployment.deployTxData.public.contractAddress;

    await deployed.callTx.addDelegator(filledBytes(0x41), shieldedCoinKeyOf(delegator), 1n, 1n);

    const funding = await deployer.wallet.transferTransaction(
      [
        {
          type: 'shielded',
          outputs: Array.from({ length: 4 }, () => ({
            type: shieldedToken().raw,
            amount: SHARE,
            receiverAddress: address(beneficiary),
          })),
        },
      ],
      {
        shieldedSecretKeys: deployer.shieldedSecretKeys,
        dustSecretKey: deployer.dustSecretKey,
      },
      { ttl: TTL() }
    );
    const fundingTx = await deployer.wallet.finalizeRecipe(funding);
    await deployer.wallet.submitTransaction(fundingTx);
    const beneficiaryState = await waitBalance(
      'beneficiary funding',
      beneficiary,
      beneficiaryBalanceBefore + PRICE * 2n
    );
    void beneficiaryState;

    const beneficiaryProviders = await providersFor<RewardSplitContractType>(
      beneficiary,
      config,
      'reward-split-wallet-beneficiary',
      zkPath
    );
    beneficiaryProviders.privateStateProvider.setContractAddress(contractAddress);
    const beneficiaryTargetProviders = await providersFor<FallibleUserTargetType>(
      beneficiary,
      config,
      'reward-split-target-beneficiary',
      targetZkPath
    );
    const proofProvider = rewardSplitCompositeProofProvider(
      config.proofServer,
      zkPath,
      targetZkPath
    );

    const runScenario = async (
      index: number,
      expiry: bigint,
      expectedStatus: 'SucceedEntirely' | 'FailFallible'
    ) => {
      const state = await waitForWalletSync(beneficiary, TIMEOUT_MS);
      const coins = [...(state.shielded.state.state as ZswapLocalState).coins].filter(
        (coin) => coin.type === shieldedToken().raw && coin.value === SHARE
      );
      assert(coins.length >= 2, 'two exact 1 NIGHT coins are required');
      const delegatorCoin = encodeQualifiedShieldedCoinInfo(coins[0]);
      const sponsorCoin = encodeQualifiedShieldedCoinInfo(coins[1]);
      const privateState = createPrivateState(filledBytes(0x08));
      const purchaseId = filledBytes(0x60 + index);
      const delegatorPayment = {
        nonce: delegatorCoin.nonce,
        color: delegatorCoin.color,
        value: SHARE,
      };
      await beneficiaryProviders.privateStateProvider.set(PRIVATE_STATE_ID, privateState);

      const delegatorCall = await createUnprovenCallTx(beneficiaryProviders, {
        compiledContract: RewardSplitCompiledContract,
        contractAddress,
        circuitId: 'purchaseDelegatorReward',
        privateStateId: PRIVATE_STATE_ID,
        additionalCoinEncPublicKeyMappings: new Map([
          [
            delegator.shieldedSecretKeys.coinPublicKey,
            delegator.shieldedSecretKeys.encryptionPublicKey,
          ],
        ]),
        args: [delegatorPayment],
      });

      const chainAndState =
        await beneficiaryProviders.publicDataProvider.queryZSwapAndContractState(contractAddress);
      assert(chainAndState, 'reward contract state not found');
      const runtimeStep = runtime.circuits.purchaseDelegatorReward(
        createCircuitContext(
          contractAddress,
          beneficiary.shieldedSecretKeys.coinPublicKey,
          chainAndState[1],
          privateState
        ),
        delegatorPayment
      );
      const postDelegatorState = ContractState.deserialize(chainAndState[1].serialize());
      postDelegatorState.data = runtimeStep.context.currentQueryContext.state;

      const sponsorCall = await createUnprovenCallTxFromInitialStates(
        beneficiaryProviders.zkConfigProvider,
        {
          compiledContract: RewardSplitCompiledContract,
          contractAddress,
          circuitId: 'deliverSponsorReward',
          args: [purchaseId, { nonce: sponsorCoin.nonce, color: sponsorCoin.color, value: SHARE }],
          coinPublicKey: beneficiary.shieldedSecretKeys.coinPublicKey,
          initialContractState: postDelegatorState,
          initialZswapChainState: chainAndState[0] as unknown as ZswapChainState,
          ledgerParameters: LedgerParameters.initialParameters(),
          initialPrivateState: privateState,
          additionalCoinEncPublicKeyMappings: new Map([
            [
              dustSponsor.shieldedSecretKeys.coinPublicKey,
              dustSponsor.shieldedSecretKeys.encryptionPublicKey,
            ],
          ]),
        },
        beneficiary.shieldedSecretKeys.encryptionPublicKey
      );
      const targetCall = await createUnprovenCallTx(beneficiaryTargetProviders, {
        compiledContract: FallibleUserTargetCompiledContract,
        contractAddress: targetAddress,
        circuitId: 'interact',
        args: [expiry],
      });
      const targetChainAndState =
        await beneficiaryTargetProviders.publicDataProvider.queryZSwapAndContractState(
          targetAddress
        );
      assert(targetChainAndState, 'fallible target state not found');
      const merged = singleIntentTransaction([
        {
          circuitId: 'purchaseDelegatorReward',
          contractAddress,
          initialContractState: chainAndState[1],
          callData: delegatorCall as CallData,
        },
        {
          circuitId: 'deliverSponsorReward',
          contractAddress,
          initialContractState: postDelegatorState,
          callData: sponsorCall as CallData,
        },
        {
          circuitId: 'interact',
          contractAddress: targetAddress,
          initialContractState: targetChainAndState[1],
          callData: targetCall as CallData,
        },
      ]);
      const proved = await proofProvider.proveTx(merged);
      const recipe = await beneficiary.wallet.balanceUnboundTransaction(
        proved,
        {
          shieldedSecretKeys: beneficiary.shieldedSecretKeys,
          dustSecretKey: beneficiary.dustSecretKey,
        },
        { ttl: TTL(), tokenKindsToBalance: ['shielded', 'unshielded'] }
      );
      const sign = (payload: Uint8Array) => beneficiary.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, sign, 'proof');
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, sign, 'pre-proof');
      }
      const finalizedByBeneficiary = await beneficiary.wallet.finalizeRecipe(recipe);
      const roundTrip = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
        'signature',
        'proof',
        'binding',
        finalizedByBeneficiary.serialize()
      );
      const dustRecipe = await dustSponsor.wallet.balanceFinalizedTransaction(
        roundTrip,
        {
          shieldedSecretKeys: dustSponsor.shieldedSecretKeys,
          dustSecretKey: dustSponsor.dustSecretKey,
        },
        { ttl: TTL(), tokenKindsToBalance: ['dust'] }
      );
      const sponsored = await dustSponsor.wallet.finalizeRecipe(dustRecipe);
      if (expectedStatus === 'FailFallible') {
        while (BigInt(Math.floor(Date.now() / 1000)) <= expiry) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      const txId = await dustSponsor.wallet.submitTransaction(sponsored);
      const observed = await withTimeout(
        'composite transaction finalization',
        TIMEOUT_MS,
        beneficiaryProviders.publicDataProvider.watchForTxData(txId)
      );
      assert.equal(observed.status, expectedStatus);
      return { transactionId: String(txId), status: observed.status };
    };

    const success = await runScenario(
      1,
      BigInt(Math.floor(Date.now() / 1000) + 600),
      'SucceedEntirely'
    );
    await waitBalance('successful sponsor reward', dustSponsor, sponsorBalanceBefore + SHARE);
    const failure = await runScenario(
      2,
      BigInt(Math.floor(Date.now() / 1000) + 20),
      'FailFallible'
    );
    const delegatorAfter = await waitBalance(
      'delegator rewards',
      delegator,
      delegatorBalanceBefore + SHARE * 2n
    );
    const sponsorAfter = await waitForWalletSync(dustSponsor, TIMEOUT_MS);
    const sponsorIncrease =
      (sponsorAfter.shielded.balances[shieldedToken().raw] ?? 0n) - sponsorBalanceBefore;
    const delegatorIncrease =
      (delegatorAfter.shielded.balances[shieldedToken().raw] ?? 0n) - delegatorBalanceBefore;
    assert.equal(sponsorIncrease, SHARE);
    assert.equal(delegatorIncrease, SHARE * 2n);

    console.log(
      JSON.stringify({
        walletRewardSplit: 'confirmed',
        contractAddress,
        targetAddress,
        success,
        fallibleFailure: failure,
        sponsorIncrease: sponsorIncrease.toString(),
        delegatorIncrease: delegatorIncrease.toString(),
      })
    );
  } finally {
    await stopWallets(wallets);
  }
};

await main();
