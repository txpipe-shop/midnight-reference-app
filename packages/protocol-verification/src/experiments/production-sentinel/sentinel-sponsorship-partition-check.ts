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

const filledBytes = (fill: number, length = 32) => new Uint8Array(length).fill(fill);
const LOCAL_SECRET_KEY = filledBytes(0x01);
const SPONSOR_ID = filledBytes(0x02);
const NATIVE_NIGHT_COLOR = filledBytes(0x00);
const PROBE_ELIGIBILITY_OPERATOR = filledBytes(0x00);
const SPONSORSHIP_POLICY_HASH = filledBytes(0x05);
const DELEGATOR_ID = filledBytes(0x06);
const DELEGATOR_NIGHT_REWARD_ADDRESS = filledBytes(0x07, 96);
const DELEGATOR_PAYMENT_NONCE = filledBytes(0x0a);
const PURCHASE_ID = filledBytes(0x0b);
const SPONSOR_PAYMENT_NONCE = filledBytes(0x0c);
const TARGET_ADDRESS = filledBytes(0x0d);
const TARGET_ENTRY_POINT_HASH = filledBytes(0x0e);
const TARGET_COMMUNICATION_COMMITMENT = 15n;
const SPONSOR_SHARE = 1n;
const DELEGATOR_SHARE = 1n;
const MINIMUM_REGISTERED_NIGHT = 1n;
const DELEGATOR_VERIFICATION_BLOCK = 1n;
const DELEGATOR_ENROLLMENT_NONCE = 1n;
const privateState = { secretKey: LOCAL_SECRET_KEY };
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
  SPONSOR_ID,
  NATIVE_NIGHT_COLOR,
  { bytes: Buffer.from(sponsorCoinPublicKey, 'hex') },
  Buffer.from(sponsorEncryptionPublicKey, 'hex'),
  SPONSOR_SHARE,
  DELEGATOR_SHARE,
  MINIMUM_REGISTERED_NIGHT,
  PROBE_ELIGIBILITY_OPERATOR,
  SPONSORSHIP_POLICY_HASH
);
const operator = ledger(probe.currentContractState.data).owner;
const initial = runtime.initialState(
  createConstructorContext(privateState, coinPublicKey),
  SPONSOR_ID,
  NATIVE_NIGHT_COLOR,
  { bytes: Buffer.from(sponsorCoinPublicKey, 'hex') },
  Buffer.from(sponsorEncryptionPublicKey, 'hex'),
  SPONSOR_SHARE,
  DELEGATOR_SHARE,
  MINIMUM_REGISTERED_NIGHT,
  operator,
  SPONSORSHIP_POLICY_HASH
);
const queued = runtime.circuits.addDelegator(
  createCircuitContext(contractAddress, coinPublicKey, initial.currentContractState, privateState),
  DELEGATOR_ID,
  DELEGATOR_NIGHT_REWARD_ADDRESS,
  { bytes: Buffer.from(delegatorCoinPublicKey, 'hex') },
  Buffer.from(delegatorEncryptionPublicKey, 'hex'),
  MINIMUM_REGISTERED_NIGHT,
  DELEGATOR_VERIFICATION_BLOCK,
  DELEGATOR_ENROLLMENT_NONCE
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
    args: [
      {
        nonce: DELEGATOR_PAYMENT_NONCE,
        color: NATIVE_NIGHT_COLOR,
        value: DELEGATOR_SHARE,
      },
    ],
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
    args: [
      PURCHASE_ID,
      {
        nonce: SPONSOR_PAYMENT_NONCE,
        color: NATIVE_NIGHT_COLOR,
        value: SPONSOR_SHARE,
      },
      TARGET_ADDRESS,
      TARGET_ENTRY_POINT_HASH,
      TARGET_COMMUNICATION_COMMITMENT,
    ],
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
