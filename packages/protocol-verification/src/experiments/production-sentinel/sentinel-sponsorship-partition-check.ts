import {
  ContractState,
  ChargedState,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { LedgerParameters, ZswapChainState, ZswapSecretKeys } from '@midnight-ntwrk/ledger-v8';
import { createUnprovenCallTxFromInitialStates } from '@midnight-ntwrk/midnight-js-contracts';
import { CompactCompiledContract, Contract, ledger } from '@midnight-sentinel/contract';
import { NodeZkConfigProvider } from '@midnight-sentinel/contract/providers';
import { setNetworkId } from '@midnight-sentinel/wallet';
import { Roles } from '../../../../wallet/node_modules/@midnight-ntwrk/wallet-sdk-hd/dist/index.js';
import { deriveKeysFromSeed } from '../../../../wallet/dist/utils/index.js';

setNetworkId('undeployed');

const bytes = (fill: number, length = 32) => new Uint8Array(length).fill(fill);
const privateState = { secretKey: bytes(1) };
const shieldedKeys = (seed: string) =>
  ZswapSecretKeys.fromSeed(deriveKeysFromSeed(seed)[Roles.Zswap]);
const beneficiaryKeys = shieldedKeys('77'.repeat(32));
const sponsorKeys = shieldedKeys('00'.repeat(31) + '03');
const delegatorKeys = shieldedKeys('00'.repeat(31) + '02');
const coinPublicKey = beneficiaryKeys.coinPublicKey;
const encryptionPublicKey = beneficiaryKeys.encryptionPublicKey;
const sponsorCoinPublicKey = sponsorKeys.coinPublicKey;
const sponsorEncryptionPublicKey = sponsorKeys.encryptionPublicKey;
const delegatorCoinPublicKey = delegatorKeys.coinPublicKey;
const delegatorEncryptionPublicKey = delegatorKeys.encryptionPublicKey;
const contractAddress = sampleContractAddress();
const runtime = new Contract({
  localSecretKey: ({ privateState: state }) => [state, state.secretKey],
});
const probe = runtime.initialState(
  createConstructorContext(privateState, coinPublicKey),
  bytes(2),
  bytes(0),
  { bytes: Buffer.from(sponsorCoinPublicKey, 'hex') },
  Buffer.from(sponsorEncryptionPublicKey, 'hex'),
  1n,
  1n,
  1n,
  bytes(0),
  bytes(5)
);
const operator = ledger(probe.currentContractState.data).owner;
const initial = runtime.initialState(
  createConstructorContext(privateState, coinPublicKey),
  bytes(2),
  bytes(0),
  { bytes: Buffer.from(sponsorCoinPublicKey, 'hex') },
  Buffer.from(sponsorEncryptionPublicKey, 'hex'),
  1n,
  1n,
  1n,
  operator,
  bytes(5)
);
const queued = runtime.circuits.addDelegator(
  createCircuitContext(contractAddress, coinPublicKey, initial.currentContractState, privateState),
  bytes(6),
  bytes(7, 96),
  { bytes: Buffer.from(delegatorCoinPublicKey, 'hex') },
  Buffer.from(delegatorEncryptionPublicKey, 'hex'),
  1n,
  1n,
  1n
);
const provider = new NodeZkConfigProvider(
  new URL('../../../../contract/src/managed/sentinel', import.meta.url).pathname
);
const queuedState = ContractState.deserialize(initial.currentContractState.serialize());
queuedState.data = queued.context.currentQueryContext.state;
const common = {
  compiledContract: CompactCompiledContract,
  contractAddress,
  coinPublicKey,
  initialZswapChainState: new ZswapChainState(),
  ledgerParameters: LedgerParameters.initialParameters(),
  initialPrivateState: privateState,
};
const delegator = await createUnprovenCallTxFromInitialStates(
  provider,
  {
    ...common,
    circuitId: 'purchaseDelegatorReward',
    args: [{ nonce: bytes(10), color: bytes(0), value: 1n }],
    initialContractState: queuedState,
    additionalCoinEncPublicKeyMappings: new Map([
      [delegatorCoinPublicKey, delegatorEncryptionPublicKey],
    ]),
  },
  encryptionPublicKey
);
const post = ContractState.deserialize(queuedState.serialize());
post.data = new ChargedState(delegator.public.nextContractState);
const sponsor = await createUnprovenCallTxFromInitialStates(
  provider,
  {
    ...common,
    circuitId: 'deliverSponsorReward',
    args: [bytes(11), { nonce: bytes(12), color: bytes(0), value: 1n }, bytes(13), bytes(14), 15n],
    initialContractState: post,
    additionalCoinEncPublicKeyMappings: new Map([
      [sponsorCoinPublicKey, sponsorEncryptionPublicKey],
    ]),
  },
  encryptionPublicKey
);

const partition = (call: typeof delegator) => ({
  guaranteedPresent: call.public.partitionedTranscript[0] !== undefined,
  falliblePresent: call.public.partitionedTranscript[1] !== undefined,
  operationCount: call.public.publicTranscript.length,
});
const result = {
  purchaseDelegatorReward: partition(delegator),
  deliverSponsorReward: partition(sponsor),
};
console.log(JSON.stringify(result, null, 2));
if (
  !result.purchaseDelegatorReward.guaranteedPresent ||
  result.purchaseDelegatorReward.falliblePresent ||
  result.deliverSponsorReward.guaranteedPresent ||
  !result.deliverSponsorReward.falliblePresent
) {
  process.exitCode = 1;
}
