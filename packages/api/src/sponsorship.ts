import {
  Binding,
  ContractCall,
  ContractDeploy,
  LedgerParameters,
  PreProof,
  Proof,
  SignatureEnabled,
  Transaction,
  type UnprovenTransaction,
  encodeQualifiedShieldedCoinInfo,
  entryPointHash,
  shieldedToken,
  type FinalizedTransaction,
  type ZswapLocalState,
} from '@midnight-ntwrk/ledger-v8';
import {
  ContractState as CompactContractState,
  CostModel as CompactCostModel,
  QueryContext as CompactQueryContext,
  type AlignedValue as CompactAlignedValue,
  ChargedState as CompactChargedState,
  type Transcript as CompactTranscript,
} from '@midnight-ntwrk/compact-runtime';
import {
  createUnprovenCallTx,
  createUnprovenCallTxFromInitialStates,
} from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import {
  ZKConfigProvider,
  type ProverKey,
  type VerifierKey,
  type ZKIR,
} from '@midnight-ntwrk/midnight-js-types';
import {
  CompactCompiledContract,
  ledger as sentinelLedger,
  sentinelContractPrivateStateKey,
  type Ledger,
  type SentinelContractProviders,
  type SponsorshipReceipt,
} from '@midnight-sentinel/contract';
import { signTransactionIntents, type WalletContext } from '@midnight-sentinel/wallet';
import { createHash } from 'node:crypto';
import { assertEligible, type MidnightRegistrationProvider } from './sponsorship/eligibility.js';

const FIELD_ENCODING_TAG = 0x73;

const bytesEqual = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const bytesHex = (value: Uint8Array) => Buffer.from(value).toString('hex');

export const dustPublicKeyToBytes = (value: bigint) =>
  Uint8Array.from(Buffer.from(value.toString(16).padStart(64, '0'), 'hex'));

export const nativeNightSponsorshipConfig = (
  sponsor: WalletContext,
  policyHash: Uint8Array,
  options: {
    sponsorShare?: bigint;
    delegatorShare?: bigint;
    minimumRegisteredNight?: bigint;
    initialEligibilityOperator: Uint8Array;
  }
) => {
  if (policyHash.length !== 32) throw new Error('policyHash must be exactly 32 bytes');
  return {
    sponsorId: dustPublicKeyToBytes(sponsor.dustSecretKey.publicKey),
    acceptedColor: Uint8Array.from(Buffer.from(shieldedToken().raw, 'hex')),
    sponsorRewardKey: {
      bytes: Uint8Array.from(Buffer.from(sponsor.shieldedSecretKeys.coinPublicKey, 'hex')),
    },
    sponsorRewardEncryptionKey: Uint8Array.from(
      Buffer.from(sponsor.shieldedSecretKeys.encryptionPublicKey, 'hex')
    ),
    sponsorShare: options.sponsorShare ?? 1n,
    delegatorShare: options.delegatorShare ?? 1n,
    minimumRegisteredNight: options.minimumRegisteredNight ?? 1n,
    initialEligibilityOperator: options.initialEligibilityOperator,
    policyHash,
  };
};

export const communicationCommitmentToField = (commitment: string): bigint => {
  const encoded = Buffer.from(commitment, 'hex');
  if (encoded.length !== 33 || encoded[0] !== FIELD_ENCODING_TAG) {
    throw new SponsorshipPolicyError(
      'INVALID_COMMUNICATION_COMMITMENT',
      'Expected a tagged 33-byte communication commitment'
    );
  }
  return BigInt(`0x${Buffer.from(encoded.subarray(1)).reverse().toString('hex')}`);
};

export const fieldToCommunicationCommitment = (field: bigint): string => {
  if (field < 0n) {
    throw new SponsorshipPolicyError(
      'INVALID_COMMUNICATION_COMMITMENT',
      'Communication commitment field cannot be negative'
    );
  }
  const bigEndian = Buffer.from(field.toString(16).padStart(64, '0'), 'hex');
  if (bigEndian.length !== 32) {
    throw new SponsorshipPolicyError(
      'INVALID_COMMUNICATION_COMMITMENT',
      'Communication commitment field exceeds 32 bytes'
    );
  }
  return Buffer.concat([
    Buffer.from([FIELD_ENCODING_TAG]),
    Buffer.from(bigEndian).reverse(),
  ]).toString('hex');
};

export type SponsorshipPolicyCode =
  | 'INVALID_SERIALIZATION'
  | 'INVALID_COMMUNICATION_COMMITMENT'
  | 'WRONG_CALL_COUNT'
  | 'UNEXPECTED_ACTION'
  | 'WRONG_SPONSORSHIP_CONTRACT'
  | 'WRONG_SPONSORSHIP_ENTRY_POINT'
  | 'UNAPPROVED_TARGET'
  | 'PURCHASE_NOT_GUARANTEED'
  | 'DUST_ALREADY_PRESENT'
  | 'TTL_OUT_OF_RANGE'
  | 'FEE_TOO_HIGH'
  | 'UNRELATED_TRANSFER'
  | 'CAMPAIGN_MISMATCH'
  | 'TARGET_ALREADY_SPONSORED'
  | 'RECEIPT_MISMATCH'
  | 'STALE_CONTRACT_STATE'
  | 'NO_ELIGIBLE_DELEGATOR'
  | 'DELEGATOR_STALE'
  | 'REWARD_DELIVERY_FAILED'
  | 'CAMPAIGN_VERSION_UNSUPPORTED';

export class SponsorshipPolicyError extends Error {
  readonly code: SponsorshipPolicyCode;

  constructor(code: SponsorshipPolicyCode, message: string) {
    super(message);
    this.name = 'SponsorshipPolicyError';
    this.code = code;
  }
}

export interface SponsorshipTargetPolicy {
  address: string;
  entryPoint: string;
}

export const sponsorshipAllowlistHash = (
  targets: readonly SponsorshipTargetPolicy[]
): Uint8Array => {
  const canonical = [...targets]
    .map(({ address, entryPoint }) => ({
      address: address.toLowerCase(),
      entryPoint,
    }))
    .sort(
      (left, right) =>
        left.address.localeCompare(right.address) || left.entryPoint.localeCompare(right.entryPoint)
    );
  return Uint8Array.from(
    createHash('sha256')
      .update(JSON.stringify({ version: 1, targets: canonical }))
      .digest()
  );
};

export interface SponsorPolicy {
  sentinelAddress: string;
  sponsorId: Uint8Array;
  sponsorDustAddress: string;
  registrationProvider: MidnightRegistrationProvider;
  policyHash: Uint8Array;
  allowedTargets: readonly SponsorshipTargetPolicy[];
  minTtlMs: number;
  maxTtlMs: number;
  maxFee: bigint;
}

export interface PreparedTargetCall {
  readonly private: {
    readonly unprovenTx: UnprovenTransaction;
  };
}

export interface PrepareSponsoredTransactionOptions {
  targetCall: PreparedTargetCall;
  targetZkConfigProvider: ZKConfigProvider<string>;
  sentinelProviders: SentinelContractProviders;
  sentinelAddress: string;
  beneficiary: WalletContext;
  proofServer: string;
  ttl: Date;
  purchaseId?: Uint8Array;
}

export interface PreparedSponsoredTransaction {
  finalizedTransaction: FinalizedTransaction;
  serializedTransaction: Uint8Array;
  purchaseId: Uint8Array;
  targetAddress: string;
  targetEntryPoint: string;
  targetCommunicationCommitment: string;
}

export interface SponsorshipInspection {
  transaction: FinalizedTransaction;
  purchaseId: Uint8Array;
  receipt: SponsorshipReceipt;
  targetAddress: string;
  targetEntryPoint: string;
  targetCommunicationCommitment: string;
  targetHasFallibleTranscript: boolean;
  feeEstimate?: bigint;
}

export interface SponsorshipSubmission {
  txId: string;
  status: string;
  feeEstimate: bigint;
  purchaseId: Uint8Array;
  targetAddress: string;
  targetEntryPoint: string;
  targetCommunicationCommitment: string;
}

class MultiplexZkConfigProvider extends ZKConfigProvider<string> {
  readonly providers: ReadonlyMap<string, ZKConfigProvider<string>>;

  constructor(providers: ReadonlyMap<string, ZKConfigProvider<string>>) {
    super();
    this.providers = providers;
  }

  private provider(circuitId: string) {
    const provider = this.providers.get(circuitId);
    if (!provider) throw new Error(`No ZK configuration registered for circuit ${circuitId}`);
    return provider;
  }

  getProverKey(circuitId: string): Promise<ProverKey> {
    return this.provider(circuitId).getProverKey(circuitId);
  }

  getVerifierKey(circuitId: string): Promise<VerifierKey> {
    return this.provider(circuitId).getVerifierKey(circuitId);
  }

  getZKIR(circuitId: string): Promise<ZKIR> {
    return this.provider(circuitId).getZKIR(circuitId);
  }
}

const contractCalls = <
  P extends PreProof | Proof,
  B extends Binding | import('@midnight-ntwrk/ledger-v8').PreBinding,
>(
  transaction: Transaction<SignatureEnabled, P, B>
) =>
  [...(transaction.intents?.values() ?? [])].flatMap((intent) =>
    intent.actions.filter((action): action is ContractCall<P> => action instanceof ContractCall)
  );

const intentTtls = (transaction: FinalizedTransaction) =>
  [...(transaction.intents?.values() ?? [])].map((intent) => intent.ttl);

const hasDust = (transaction: FinalizedTransaction) =>
  [...(transaction.intents?.values() ?? [])].some((intent) => intent.dustActions !== undefined);

const entryPointName = (entryPoint: string | Uint8Array) =>
  typeof entryPoint === 'string' ? entryPoint : Buffer.from(entryPoint).toString('utf8');

const selectedTargetCall = (targetCall: PreparedTargetCall) => {
  const calls = contractCalls(targetCall.private.unprovenTx);
  if (calls.length !== 1) {
    throw new SponsorshipPolicyError(
      'WRONG_CALL_COUNT',
      `A prepared target must contain exactly one contract call; received ${calls.length}`
    );
  }
  return calls[0];
};

const randomPurchaseId = () => crypto.getRandomValues(new Uint8Array(32));

const syncedWalletState = async (wallet: WalletContext) => {
  const Rx = await import('rxjs');
  return Rx.firstValueFrom(wallet.wallet.state().pipe(Rx.filter((state) => state.isSynced)));
};

export const prepareSponsoredTransaction = async (
  options: PrepareSponsoredTransactionOptions
): Promise<PreparedSponsoredTransaction> => {
  const target = selectedTargetCall(options.targetCall);
  const targetEntryPoint = entryPointName(target.entryPoint);
  if (
    targetEntryPoint === 'purchaseDelegatorReward' ||
    targetEntryPoint === 'deliverSponsorReward'
  ) {
    throw new Error('Target circuit ID collides with Sentinel reward circuits');
  }

  const stateData = await options.sentinelProviders.publicDataProvider.queryZSwapAndContractState(
    options.sentinelAddress
  );
  if (!stateData) throw new Error('Sentinel contract state not found');
  const campaign = sentinelLedger(stateData[1].data);
  if (!campaign.sponsorshipEnabled) throw new Error('Sponsorship campaign is paused');
  if (campaign.delegatorCount === 0n) throw new Error('NO_ELIGIBLE_DELEGATOR');
  const selected = campaign.delegatorSlots.lookup(campaign.rewardCursor);

  const walletState = await syncedWalletState(options.beneficiary);
  const paymentCoins = [...(walletState.shielded.state.state as ZswapLocalState).coins].filter(
    (coin) =>
      coin.type === bytesHex(campaign.sponsorshipAcceptedColor) &&
      (coin.value === campaign.sponsorshipDelegatorShare ||
        coin.value === campaign.sponsorshipSponsor.share)
  );
  const delegatorCoin = paymentCoins.find(
    (coin) => coin.value === campaign.sponsorshipDelegatorShare
  );
  const sponsorCoin = paymentCoins.find(
    (coin) => coin.value === campaign.sponsorshipSponsor.share && coin !== delegatorCoin
  );
  if (!delegatorCoin || !sponsorCoin) {
    throw new Error(
      `Exact ${campaign.sponsorshipDelegatorShare} and ${campaign.sponsorshipSponsor.share} NIGHT payment coins are required`
    );
  }

  const encodedDelegator = encodeQualifiedShieldedCoinInfo(delegatorCoin);
  const encodedSponsor = encodeQualifiedShieldedCoinInfo(sponsorCoin);
  const delegatorPayment = {
    nonce: encodedDelegator.nonce,
    color: encodedDelegator.color,
    value: campaign.sponsorshipDelegatorShare,
  };
  const sponsorPayment = {
    nonce: encodedSponsor.nonce,
    color: encodedSponsor.color,
    value: campaign.sponsorshipSponsor.share,
  };
  const purchaseId = options.purchaseId ?? randomPurchaseId();
  if (purchaseId.length !== 32) throw new Error('purchaseId must be exactly 32 bytes');

  const targetCommitment = target.communicationCommitment;
  const targetCommitmentField = communicationCommitmentToField(targetCommitment);
  const delegatorCall = await createUnprovenCallTx(options.sentinelProviders, {
    compiledContract: CompactCompiledContract,
    contractAddress: options.sentinelAddress,
    circuitId: 'purchaseDelegatorReward',
    privateStateId: sentinelContractPrivateStateKey,
    additionalCoinEncPublicKeyMappings: new Map([
      [bytesHex(selected.rewardKey.bytes), bytesHex(selected.rewardEncryptionKey)],
    ]),
    args: [delegatorPayment],
  });
  if (
    delegatorCall.public.partitionedTranscript[0] === undefined ||
    delegatorCall.public.partitionedTranscript[1] !== undefined
  ) {
    throw new Error('purchaseDelegatorReward must compile as guaranteed-only');
  }

  const postDelegatorState = CompactContractState.deserialize(stateData[1].serialize());
  postDelegatorState.data = new CompactChargedState(delegatorCall.public.nextContractState);
  const sponsorCall = await createUnprovenCallTxFromInitialStates(
    options.sentinelProviders.zkConfigProvider,
    {
      compiledContract: CompactCompiledContract,
      contractAddress: options.sentinelAddress,
      circuitId: 'deliverSponsorReward',
      args: [
        purchaseId,
        sponsorPayment,
        Buffer.from(target.address, 'hex'),
        Buffer.from(entryPointHash(target.entryPoint), 'hex'),
        targetCommitmentField,
      ],
      coinPublicKey: options.beneficiary.shieldedSecretKeys.coinPublicKey,
      initialContractState: postDelegatorState,
      initialZswapChainState: stateData[0],
      ledgerParameters: LedgerParameters.initialParameters(),
      initialPrivateState: delegatorCall.private.nextPrivateState,
      additionalCoinEncPublicKeyMappings: new Map([
        [
          bytesHex(campaign.sponsorshipSponsor.rewardKey.bytes),
          bytesHex(campaign.sponsorshipSponsor.rewardEncryptionKey),
        ],
      ]),
    },
    options.beneficiary.shieldedSecretKeys.encryptionPublicKey
  );
  if (
    sponsorCall.public.partitionedTranscript[0] !== undefined ||
    sponsorCall.public.partitionedTranscript[1] === undefined
  ) {
    throw new Error('deliverSponsorReward must compile as fallible-only');
  }

  const providers = new Map<string, ZKConfigProvider<string>>([
    [targetEntryPoint, options.targetZkConfigProvider],
    [
      'purchaseDelegatorReward',
      options.sentinelProviders.zkConfigProvider as ZKConfigProvider<string>,
    ],
    [
      'deliverSponsorReward',
      options.sentinelProviders.zkConfigProvider as ZKConfigProvider<string>,
    ],
  ]);
  const proofProvider = httpClientProofProvider(
    options.proofServer,
    new MultiplexZkConfigProvider(providers)
  );
  const sourceTransactions = [
    delegatorCall.private.unprovenTx,
    sponsorCall.private.unprovenTx,
    options.targetCall.private.unprovenTx,
  ];
  const merged = sourceTransactions[0];
  const primaryEntry = [...(merged.intents?.entries() ?? [])][0];
  if (!primaryEntry) throw new Error('Delegator call has no intent');
  const [segment, primaryIntent] = primaryEntry;
  primaryIntent.actions = sourceTransactions.flatMap((tx) =>
    [...(tx.intents?.values() ?? [])].flatMap((intent) => intent.actions)
  );
  merged.intents = new Map([[segment, primaryIntent]]);
  merged.guaranteedOffer = sourceTransactions
    .map((tx) => tx.guaranteedOffer)
    .filter((offer) => offer !== undefined)
    .reduce((left, right) => left.merge(right));
  const fallibleOffers = sourceTransactions.flatMap((tx) => [
    ...(tx.fallibleOffer?.values() ?? []),
  ]);
  merged.fallibleOffer =
    fallibleOffers.length === 0
      ? undefined
      : new Map([[segment, fallibleOffers.reduce((left, right) => left.merge(right))]]);
  const proven = await proofProvider.proveTx(merged);
  const recipe = await options.beneficiary.wallet.balanceUnboundTransaction(
    proven,
    {
      shieldedSecretKeys: options.beneficiary.shieldedSecretKeys,
      dustSecretKey: options.beneficiary.dustSecretKey,
    },
    {
      ttl: options.ttl,
      tokenKindsToBalance: ['shielded', 'unshielded'],
    }
  );
  const sign = (payload: Uint8Array) => options.beneficiary.unshieldedKeystore.signData(payload);
  signTransactionIntents(recipe.baseTransaction, sign, 'proof');
  if (recipe.balancingTransaction) {
    signTransactionIntents(recipe.balancingTransaction, sign, 'pre-proof');
  }
  const finalizedTransaction = await options.beneficiary.wallet.finalizeRecipe(recipe);
  if (hasDust(finalizedTransaction)) {
    throw new Error('Beneficiary transaction unexpectedly contains a DUST action');
  }

  return {
    finalizedTransaction,
    serializedTransaction: finalizedTransaction.serialize(),
    purchaseId,
    targetAddress: target.address,
    targetEntryPoint,
    targetCommunicationCommitment: targetCommitment,
  };
};

const receiptDelta = (
  before: Ledger['sponsorshipReceipts'],
  after: Ledger['sponsorshipReceipts']
) => {
  const beforeKeys = new Set([...before].map(([key]) => bytesHex(key)));
  return [...after].filter(([key]) => !beforeKeys.has(bytesHex(key)));
};

const simulatePurchase = (
  sentinelAddress: string,
  state: CompactChargedState,
  transcript: CompactTranscript<CompactAlignedValue>
) => {
  try {
    const context = new CompactQueryContext(state, sentinelAddress);
    const after = context.runTranscript(transcript, CompactCostModel.initialCostModel());
    return { state: after.state, ledger: sentinelLedger(after.state) };
  } catch (error) {
    throw new SponsorshipPolicyError(
      'STALE_CONTRACT_STATE',
      `Sentinel purchase transcript does not execute against latest state: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

const validateTtl = (transaction: FinalizedTransaction, policy: SponsorPolicy, now: Date) => {
  const ttls = intentTtls(transaction);
  if (ttls.length === 0) {
    throw new SponsorshipPolicyError('TTL_OUT_OF_RANGE', 'Transaction has no intent TTL');
  }
  for (const ttl of ttls) {
    const remaining = ttl.getTime() - now.getTime();
    if (remaining < policy.minTtlMs || remaining > policy.maxTtlMs) {
      throw new SponsorshipPolicyError(
        'TTL_OUT_OF_RANGE',
        `Intent TTL ${ttl.toISOString()} has ${remaining}ms remaining; expected between ${policy.minTtlMs}ms and ${policy.maxTtlMs}ms`
      );
    }
  }
};

const validateNoUnrelatedTransfers = (
  transaction: FinalizedTransaction,
  calls: ContractCall<Proof>[]
) => {
  const claimedNullifiers = new Set(
    calls.flatMap((call) => [
      ...(call.guaranteedTranscript?.effects.claimedNullifiers ?? []),
      ...(call.fallibleTranscript?.effects.claimedNullifiers ?? []),
    ])
  );
  const claimedCommitments = new Set(
    calls.flatMap((call) => [
      ...(call.guaranteedTranscript?.effects.claimedShieldedReceives ?? []),
      ...(call.guaranteedTranscript?.effects.claimedShieldedSpends ?? []),
      ...(call.fallibleTranscript?.effects.claimedShieldedReceives ?? []),
      ...(call.fallibleTranscript?.effects.claimedShieldedSpends ?? []),
    ])
  );
  const offers = [
    ...(transaction.guaranteedOffer ? [transaction.guaranteedOffer] : []),
    ...[...(transaction.fallibleOffer?.values() ?? [])],
  ];
  const unclaimedInputs = offers
    .flatMap((offer) => offer.inputs)
    .filter((input) => !claimedNullifiers.has(input.nullifier));
  const unclaimedOutputs = offers
    .flatMap((offer) => offer.outputs)
    .filter((output) => !claimedCommitments.has(output.commitment));
  const unclaimedTransients = offers
    .flatMap((offer) => offer.transients)
    .filter(
      (transient) =>
        !claimedNullifiers.has(transient.nullifier) && !claimedCommitments.has(transient.commitment)
    );
  if (
    unclaimedInputs.length !== 2 ||
    unclaimedOutputs.length !== 0 ||
    unclaimedTransients.length !== 0
  ) {
    throw new SponsorshipPolicyError(
      'UNRELATED_TRANSFER',
      `Transaction contains shielded movements beyond the exact sponsorship payment and claimed call effects: ${JSON.stringify(
        {
          externalInputs: unclaimedInputs.length,
          externalOutputs: unclaimedOutputs.length,
          externalTransients: unclaimedTransients.length,
        }
      )}`
    );
  }
  const hasUnshielded = [...(transaction.intents?.values() ?? [])].some(
    (intent) =>
      intent.guaranteedUnshieldedOffer !== undefined || intent.fallibleUnshieldedOffer !== undefined
  );
  if (hasUnshielded) {
    throw new SponsorshipPolicyError(
      'UNRELATED_TRANSFER',
      'Unshielded transfers are not permitted by the v1 sponsorship policy'
    );
  }
};

export const inspectSponsorshipRequest = async (
  serialized: Uint8Array,
  policy: SponsorPolicy,
  providers: SentinelContractProviders,
  options: { expectDust?: boolean; feeEstimate?: bigint; now?: Date } = {}
): Promise<SponsorshipInspection> => {
  let transaction: FinalizedTransaction;
  try {
    transaction = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
      'signature',
      'proof',
      'binding',
      serialized
    );
    if (!bytesEqual(transaction.serialize(), serialized)) {
      throw new Error('serialization round-trip changed bytes');
    }
  } catch (error) {
    throw new SponsorshipPolicyError(
      'INVALID_SERIALIZATION',
      error instanceof Error ? error.message : String(error)
    );
  }

  const intents = [...(transaction.intents?.values() ?? [])];
  const actions = intents.flatMap((intent) => intent.actions);
  if (actions.some((action) => action instanceof ContractDeploy)) {
    throw new SponsorshipPolicyError('UNEXPECTED_ACTION', 'Contract deployments are not allowed');
  }
  if (actions.some((action) => !(action instanceof ContractCall))) {
    throw new SponsorshipPolicyError('UNEXPECTED_ACTION', 'Unexpected contract action');
  }
  const calls = contractCalls(transaction);
  const callIntents = intents.filter((intent) =>
    intent.actions.some((action) => action instanceof ContractCall)
  );
  if (callIntents.length !== 1) {
    throw new SponsorshipPolicyError(
      'WRONG_CALL_COUNT',
      'All contract calls must be in one ordered intent'
    );
  }
  if (calls.length !== 3) {
    throw new SponsorshipPolicyError(
      'WRONG_CALL_COUNT',
      `Expected exactly three contract calls; received ${calls.length}`
    );
  }

  const [delegatorReward, sponsorReward, target] = calls;
  if (
    delegatorReward.address !== policy.sentinelAddress ||
    sponsorReward.address !== policy.sentinelAddress
  ) {
    throw new SponsorshipPolicyError(
      'WRONG_SPONSORSHIP_CONTRACT',
      'Sentinel sponsorship call is missing'
    );
  }
  if (
    entryPointName(delegatorReward.entryPoint) !== 'purchaseDelegatorReward' ||
    entryPointName(sponsorReward.entryPoint) !== 'deliverSponsorReward'
  ) {
    throw new SponsorshipPolicyError(
      'WRONG_SPONSORSHIP_ENTRY_POINT',
      'Sentinel reward calls are missing or reordered'
    );
  }
  if (
    !delegatorReward.guaranteedTranscript ||
    delegatorReward.fallibleTranscript ||
    sponsorReward.guaranteedTranscript ||
    !sponsorReward.fallibleTranscript
  ) {
    throw new SponsorshipPolicyError(
      'PURCHASE_NOT_GUARANTEED',
      'Reward calls do not have the required guaranteed/fallible partition'
    );
  }

  const targetEntryPoint = entryPointName(target.entryPoint);
  if (!target.fallibleTranscript) {
    throw new SponsorshipPolicyError(
      'PURCHASE_NOT_GUARANTEED',
      'Target call must contain a fallible transcript'
    );
  }
  if (
    !policy.allowedTargets.some(
      (allowed) => allowed.address === target.address && allowed.entryPoint === targetEntryPoint
    )
  ) {
    throw new SponsorshipPolicyError('UNAPPROVED_TARGET', 'Target call is not approved');
  }

  const dustPresent = hasDust(transaction);
  if (dustPresent !== Boolean(options.expectDust)) {
    throw new SponsorshipPolicyError(
      'DUST_ALREADY_PRESENT',
      options.expectDust ? 'Sponsored transaction is missing DUST' : 'DUST already present'
    );
  }
  validateTtl(transaction, policy, options.now ?? new Date());
  validateNoUnrelatedTransfers(transaction, calls);

  const queried = await providers.publicDataProvider.queryZSwapAndContractState(
    policy.sentinelAddress
  );
  if (!queried) {
    throw new SponsorshipPolicyError('CAMPAIGN_MISMATCH', 'Sentinel state was not found');
  }
  const [, contractState] = queried;
  const before = sentinelLedger(contractState.data);
  if (
    !bytesEqual(before.sponsorshipSponsor.id, policy.sponsorId) ||
    !bytesEqual(before.sponsorshipSponsor.policyHash, policy.policyHash) ||
    !before.sponsorshipEnabled
  ) {
    throw new SponsorshipPolicyError(
      'CAMPAIGN_MISMATCH',
      'On-chain campaign does not match sponsor policy'
    );
  }
  const targetCommitmentField = communicationCommitmentToField(target.communicationCommitment);
  if (
    [...before.sponsorshipReceipts].some(
      ([, existing]) => existing.targetCommunicationCommitment === targetCommitmentField
    )
  ) {
    throw new SponsorshipPolicyError(
      'TARGET_ALREADY_SPONSORED',
      'Target interaction has already been sponsored'
    );
  }
  const afterDelegator = simulatePurchase(
    policy.sentinelAddress,
    CompactContractState.deserialize(contractState.serialize()).data,
    delegatorReward.guaranteedTranscript as CompactTranscript<CompactAlignedValue>
  );
  const afterSponsor = simulatePurchase(
    policy.sentinelAddress,
    afterDelegator.state,
    sponsorReward.fallibleTranscript as CompactTranscript<CompactAlignedValue>
  );
  const after = afterSponsor.ledger;
  const addedReceipts = receiptDelta(before.sponsorshipReceipts, after.sponsorshipReceipts);
  if (
    addedReceipts.length !== 1 ||
    after.sponsorshipPurchases !== before.sponsorshipPurchases + 1n
  ) {
    throw new SponsorshipPolicyError(
      'RECEIPT_MISMATCH',
      'Purchase transcript does not produce the exact expected receipt and accounting delta'
    );
  }
  const [purchaseId, receipt] = addedReceipts[0];
  if (
    !bytesEqual(receipt.targetAddress, Buffer.from(target.address, 'hex')) ||
    !bytesEqual(
      receipt.targetEntryPointHash,
      Buffer.from(entryPointHash(target.entryPoint), 'hex')
    ) ||
    receipt.targetCommunicationCommitment !== targetCommitmentField
  ) {
    throw new SponsorshipPolicyError(
      'RECEIPT_MISMATCH',
      'Receipt does not bind the approved target call'
    );
  }
  if (options.feeEstimate !== undefined && options.feeEstimate > policy.maxFee) {
    throw new SponsorshipPolicyError(
      'FEE_TOO_HIGH',
      `Estimated fee ${options.feeEstimate} exceeds ${policy.maxFee}`
    );
  }

  return {
    transaction,
    purchaseId,
    receipt,
    targetAddress: target.address,
    targetEntryPoint,
    targetCommunicationCommitment: target.communicationCommitment,
    targetHasFallibleTranscript: target.fallibleTranscript !== undefined,
    feeEstimate: options.feeEstimate,
  };
};

const sponsorAndSubmitUnlocked = async (
  serialized: Uint8Array,
  policy: SponsorPolicy,
  providers: SentinelContractProviders,
  sponsor: WalletContext
): Promise<SponsorshipSubmission> => {
  const sponsorTtlMs = Math.min(policy.maxTtlMs, 30 * 60_000);
  if (sponsorTtlMs < policy.minTtlMs) {
    throw new SponsorshipPolicyError(
      'TTL_OUT_OF_RANGE',
      'Sponsor policy minimum TTL exceeds the sponsor balancing TTL'
    );
  }
  const expectedSponsor = dustPublicKeyToBytes(sponsor.dustSecretKey.publicKey);
  if (!bytesEqual(expectedSponsor, policy.sponsorId)) {
    throw new SponsorshipPolicyError(
      'CAMPAIGN_MISMATCH',
      'Sponsor wallet DUST public key does not match campaign sponsor ID'
    );
  }
  const before = await inspectSponsorshipRequest(serialized, policy, providers);
  const current = await providers.publicDataProvider.queryZSwapAndContractState(
    policy.sentinelAddress
  );
  if (!current) {
    throw new SponsorshipPolicyError('CAMPAIGN_MISMATCH', 'Sentinel state was not found');
  }
  const campaign = sentinelLedger(current[1].data);
  if (campaign.delegatorCount === 0n) {
    throw new SponsorshipPolicyError('NO_ELIGIBLE_DELEGATOR', 'No eligible delegator is available');
  }
  const selected = campaign.delegatorSlots.lookup(campaign.rewardCursor);
  const rewardAddress = Buffer.from(selected.nightRewardAddress)
    .toString('utf8')
    .replace(/\0+$/, '');
  try {
    assertEligible(
      await policy.registrationProvider.getStatus(rewardAddress),
      policy.sponsorDustAddress,
      campaign.sponsorshipMinimumRegisteredNight
    );
  } catch (error) {
    throw new SponsorshipPolicyError(
      'DELEGATOR_STALE',
      error instanceof Error ? error.message : String(error)
    );
  }
  const feeEstimate = await sponsor.wallet.estimateTransactionFee(
    before.transaction,
    sponsor.dustSecretKey,
    { ttl: new Date(Date.now() + sponsorTtlMs) }
  );
  if (feeEstimate > policy.maxFee) {
    throw new SponsorshipPolicyError(
      'FEE_TOO_HIGH',
      `Estimated fee ${feeEstimate} exceeds ${policy.maxFee}`
    );
  }

  const recipe = await sponsor.wallet.balanceFinalizedTransaction(
    before.transaction,
    {
      shieldedSecretKeys: sponsor.shieldedSecretKeys,
      dustSecretKey: sponsor.dustSecretKey,
    },
    {
      ttl: new Date(Date.now() + sponsorTtlMs),
      tokenKindsToBalance: ['dust'],
    }
  );
  const sponsored = await sponsor.wallet.finalizeRecipe(recipe);
  const after = await inspectSponsorshipRequest(sponsored.serialize(), policy, providers, {
    expectDust: true,
    feeEstimate,
  });
  if (
    before.targetAddress !== after.targetAddress ||
    before.targetEntryPoint !== after.targetEntryPoint ||
    before.targetCommunicationCommitment !== after.targetCommunicationCommitment ||
    !bytesEqual(before.purchaseId, after.purchaseId)
  ) {
    throw new SponsorshipPolicyError(
      'RECEIPT_MISMATCH',
      'Sponsorship balancing changed the committed request'
    );
  }

  const txId = await sponsor.wallet.submitTransaction(sponsored);
  const finalized = await providers.publicDataProvider.watchForTxData(txId);
  return {
    txId,
    status: finalized.status,
    feeEstimate,
    purchaseId: after.purchaseId,
    targetAddress: after.targetAddress,
    targetEntryPoint: after.targetEntryPoint,
    targetCommunicationCommitment: after.targetCommunicationCommitment,
  };
};

const submissionTails = new Map<string, Promise<void>>();

export const sponsorAndSubmit = async (
  serialized: Uint8Array,
  policy: SponsorPolicy,
  providers: SentinelContractProviders,
  sponsor: WalletContext
): Promise<SponsorshipSubmission> => {
  const previous = submissionTails.get(policy.sentinelAddress) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  submissionTails.set(policy.sentinelAddress, tail);
  await previous;
  try {
    return await sponsorAndSubmitUnlocked(serialized, policy, providers, sponsor);
  } finally {
    release();
    if (submissionTails.get(policy.sentinelAddress) === tail) {
      submissionTails.delete(policy.sentinelAddress);
    }
  }
};
