import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { SentinelContractConstructor, SentinelContractType } from './types.js';
import { witnesses } from './witnesses.js';

const tag = 'SentinelContract';
export const CompactCompiledContract = CompiledContract.make<SentinelContractType>(
  tag,
  SentinelContractConstructor
).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(
    /* @vite-ignore */
    new URL('./managed/sentinel', import.meta.url).pathname
  )
);

export { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
export * from './managed/sentinel/contract/index.js';
export { createPrivateState, type PrivateState } from './private-state.js';
export { sentinelContractPrivateStateKey } from './types.js';
export type {
  SentinelContractCircuitKeys,
  SentinelContractDeployed,
  SentinelContractProviders,
  SentinelContractType,
  PrivateStateId,
} from './types.js';
export { witnesses };
