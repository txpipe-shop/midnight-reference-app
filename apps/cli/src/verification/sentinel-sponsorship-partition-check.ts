import {
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import {
  LedgerParameters,
  ZswapChainState,
} from '@midnight-ntwrk/ledger-v8';
import { createUnprovenCallTxFromInitialStates } from '@midnight-ntwrk/midnight-js-contracts';
import { CompactCompiledContract, Contract } from '@midnight-sentinel/contract';
import { NodeZkConfigProvider } from '@midnight-sentinel/contract/providers';
import {
  CompositeSponsorshipCompiledContract,
  CompositeSponsorshipContractConstructor,
} from '@midnight-sentinel/contract/verification/composite-sponsorship';
import { setNetworkId } from '@midnight-sentinel/wallet';

setNetworkId('undeployed');

const bytes = (fill: number) => new Uint8Array(32).fill(fill);
const privateState = { secretKey: bytes(1) };
const coinPublicKey = '01'.repeat(32);
const encryptionPublicKey = '02'.repeat(32);
const runtime = new Contract({
  localSecretKey: ({ privateState: state }) => [state, privateState.secretKey],
});
const initial = runtime.initialState(
  createConstructorContext(privateState, coinPublicKey),
  bytes(2),
  bytes(3),
  100n,
  bytes(4)
);
const call = await createUnprovenCallTxFromInitialStates(
  new NodeZkConfigProvider(
    new URL('../../../packages/contract/src/managed/sentinel', import.meta.url).pathname
  ),
  {
    compiledContract: CompactCompiledContract,
    contractAddress: sampleContractAddress(),
    circuitId: 'purchaseSponsorship',
    args: [
      bytes(5),
      { nonce: bytes(6), color: bytes(3), value: 100n },
      bytes(7),
      bytes(8),
      9n,
    ],
    coinPublicKey,
    initialContractState: initial.currentContractState,
    initialZswapChainState: new ZswapChainState(),
    ledgerParameters: LedgerParameters.initialParameters(),
    initialPrivateState: privateState,
  },
  encryptionPublicKey
);

const result = {
  operations: call.public.publicTranscript.map((operation) =>
    typeof operation === 'string' ? operation : Object.keys(operation as object)[0]
  ),
  guaranteedPresent: call.public.partitionedTranscript[0] !== undefined,
  falliblePresent: call.public.partitionedTranscript[1] !== undefined,
};
console.log(JSON.stringify(result, null, 2));
if (!result.guaranteedPresent || result.falliblePresent) process.exitCode = 1;

const compositeRuntime = new CompositeSponsorshipContractConstructor({});
const compositeInitial = compositeRuntime.initialState(
  createConstructorContext(undefined, coinPublicKey),
  bytes(2),
  bytes(3),
  100n
);
const compositeCall = await createUnprovenCallTxFromInitialStates(
  new NodeZkConfigProvider(
    new URL(
      '../../../packages/contract/src/managed/composite-sponsorship',
      import.meta.url
    ).pathname
  ),
  {
    compiledContract: CompositeSponsorshipCompiledContract,
    contractAddress: sampleContractAddress(),
    circuitId: 'purchaseSponsorship',
    args: [
      bytes(5),
      bytes(2),
      { nonce: bytes(6), color: bytes(3), value: 100n },
      bytes(7),
      bytes(8),
      new Uint8Array(33).fill(9),
    ],
    coinPublicKey,
    initialContractState: compositeInitial.currentContractState,
    initialZswapChainState: new ZswapChainState(),
    ledgerParameters: LedgerParameters.initialParameters(),
  },
  encryptionPublicKey
);
console.log(
  JSON.stringify(
    {
      compositeOperations: compositeCall.public.publicTranscript.map((operation) =>
        typeof operation === 'string'
          ? operation
          : Object.keys(operation as object)[0]
      ),
      compositeGuaranteed:
        compositeCall.public.partitionedTranscript[0] !== undefined,
      compositeFallible:
        compositeCall.public.partitionedTranscript[1] !== undefined,
    },
    null,
    2
  )
);
