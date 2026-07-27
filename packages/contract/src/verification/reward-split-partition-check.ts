// Reuse the wallet package's pinned ledger runtime.
// @ts-ignore the direct Node entry point has no adjacent declaration file.
import { LedgerParameters, ZswapChainState, ZswapSecretKeys } from '../../../wallet/node_modules/@midnight-ntwrk/ledger-v8/midnight_ledger_wasm_fs.js';
import { Roles } from '../../../wallet/node_modules/@midnight-ntwrk/wallet-sdk-hd/dist/index.js';
import { deriveKeysFromSeed } from '../../../wallet/dist/utils/index.js';
import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { createUnprovenCallTxFromInitialStates } from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId } from '@midnight-sentinel/wallet';
import { NodeZkConfigProvider } from '../providers.js';
import { createPrivateState } from '../private-state.js';
import {
  RewardSplitCompiledContract,
  RewardSplitContractConstructor,
  rewardSplitLedger,
} from './reward-split-contract.js';
import {
  FallibleUserTargetCompiledContract,
  FallibleUserTargetConstructor,
} from './fallible-user-target-contract.js';

setNetworkId('undeployed');

const bytes = (fill: number) => new Uint8Array(32).fill(fill);
const privateState = createPrivateState(bytes(1));
const shieldedKeys = (seed: string) =>
  ZswapSecretKeys.fromSeed(deriveKeysFromSeed(seed)[Roles.Zswap]);
const beneficiaryKeys = shieldedKeys('77'.repeat(32));
const sponsorKeys = shieldedKeys('00'.repeat(31) + '03');
const delegatorKeys = shieldedKeys('00'.repeat(31) + '02');
const beneficiaryCoinKey = beneficiaryKeys.coinPublicKey;
const beneficiaryEncryptionKey = beneficiaryKeys.encryptionPublicKey;
const sponsorCoinKey = sponsorKeys.coinPublicKey;
const sponsorEncryptionKey = sponsorKeys.encryptionPublicKey;
const delegatorCoinKey = delegatorKeys.coinPublicKey;
const delegatorEncryptionKey = delegatorKeys.encryptionPublicKey;
const contractAddress = sampleContractAddress();
const targetAddress = sampleContractAddress();
const contract = new RewardSplitContractConstructor({
  localSecretKey: ({ privateState: current }) => [current, current.secretKey],
});
const probe = contract.initialState(
  createConstructorContext(privateState, beneficiaryCoinKey),
  bytes(0x11),
  bytes(0),
  { bytes: Buffer.from(sponsorCoinKey, 'hex') },
  1n,
  1n,
  1n,
  bytes(0)
);
const operatorKey = rewardSplitLedger(probe.currentContractState.data).owner;
const initial = contract.initialState(
  createConstructorContext(privateState, beneficiaryCoinKey),
  bytes(0x11),
  bytes(0),
  { bytes: Buffer.from(sponsorCoinKey, 'hex') },
  1n,
  1n,
  1n,
  operatorKey
);
const queued = contract.circuits.addDelegator(
  createCircuitContext(
    contractAddress,
    initial.currentZswapLocalState,
    initial.currentContractState,
    privateState
  ),
  bytes(0x41),
  { bytes: Buffer.from(delegatorCoinKey, 'hex') },
  1n,
  1n
);
const queuedContractState = initial.currentContractState;
queuedContractState.data = queued.context.currentQueryContext.state;

const delegatorPayment = { nonce: bytes(0x71), color: bytes(0), value: 1n };
const delegatorCall = await createUnprovenCallTxFromInitialStates(
  new NodeZkConfigProvider(
    new URL('../managed/reward-split', import.meta.url).pathname
  ),
  {
    compiledContract: RewardSplitCompiledContract,
    contractAddress,
    circuitId: 'purchaseDelegatorReward',
    args: [delegatorPayment],
    coinPublicKey: beneficiaryCoinKey,
    initialContractState: queuedContractState,
    initialZswapChainState: new ZswapChainState(),
    ledgerParameters: LedgerParameters.initialParameters(),
    initialPrivateState: privateState,
    additionalCoinEncPublicKeyMappings: new Map([
      [sponsorCoinKey, sponsorEncryptionKey],
      [delegatorCoinKey, delegatorEncryptionKey],
    ]),
  },
  beneficiaryEncryptionKey
);

const staged = contract.circuits.purchaseDelegatorReward(
  createCircuitContext(
    contractAddress,
    queued.context.currentZswapLocalState,
    queued.context.currentQueryContext.state,
    privateState
  ),
  delegatorPayment
);
const stagedContractState = queuedContractState;
stagedContractState.data = staged.context.currentQueryContext.state;
const sponsorCall = await createUnprovenCallTxFromInitialStates(
  new NodeZkConfigProvider(
    new URL('../managed/reward-split', import.meta.url).pathname
  ),
  {
    compiledContract: RewardSplitCompiledContract,
    contractAddress,
    circuitId: 'deliverSponsorReward',
    args: [
      bytes(0x61),
      { nonce: bytes(0x72), color: bytes(0), value: 1n },
    ],
    coinPublicKey: beneficiaryCoinKey,
    initialContractState: stagedContractState,
    initialZswapChainState: new ZswapChainState(),
    ledgerParameters: LedgerParameters.initialParameters(),
    initialPrivateState: privateState,
    additionalCoinEncPublicKeyMappings: new Map([
      [sponsorCoinKey, sponsorEncryptionKey],
    ]),
  },
  beneficiaryEncryptionKey
);
const target = new FallibleUserTargetConstructor({});
const targetInitial = target.initialState(
  createConstructorContext(undefined, beneficiaryCoinKey)
);
const targetCall = await createUnprovenCallTxFromInitialStates(
  new NodeZkConfigProvider(
    new URL('../managed/fallible-user-target', import.meta.url).pathname
  ),
  {
    compiledContract: FallibleUserTargetCompiledContract,
    contractAddress: targetAddress,
    circuitId: 'interact',
    args: [BigInt(Math.floor(Date.now() / 1000) + 600)],
    coinPublicKey: beneficiaryCoinKey,
    initialContractState: targetInitial.currentContractState,
    initialZswapChainState: new ZswapChainState(),
    ledgerParameters: LedgerParameters.initialParameters(),
  },
  beneficiaryEncryptionKey
);

const merged = delegatorCall.private.unprovenTx
  .merge(sponsorCall.private.unprovenTx)
  .merge(targetCall.private.unprovenTx);
const mergedCallCount = [...(merged.intents?.values() ?? [])].reduce(
  (count, intent) =>
    count +
    intent.actions.filter(
      (action) => action.constructor.name === 'ContractCall'
    ).length,
  0
);

const partition = (call: {
  public: {
    publicTranscript: unknown[];
    partitionedTranscript: [unknown | undefined, unknown | undefined];
  };
}) => ({
  guaranteedPresent: call.public.partitionedTranscript[0] !== undefined,
  falliblePresent: call.public.partitionedTranscript[1] !== undefined,
  operationCount: call.public.publicTranscript.length,
});
const result = {
  purchaseDelegatorReward: partition(delegatorCall),
  deliverSponsorReward: partition(sponsorCall),
  userInteraction: partition(targetCall),
  merged: {
    callCount: mergedCallCount,
    intentCount: merged.intents?.size ?? 0,
  },
};

console.log(JSON.stringify(result, null, 2));
if (
  !result.purchaseDelegatorReward.guaranteedPresent ||
  result.purchaseDelegatorReward.falliblePresent ||
  result.deliverSponsorReward.guaranteedPresent ||
  !result.deliverSponsorReward.falliblePresent ||
  result.userInteraction.guaranteedPresent ||
  !result.userInteraction.falliblePresent ||
  result.merged.callCount !== 3
) {
  process.exitCode = 1;
}
