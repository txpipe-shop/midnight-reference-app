import { CompiledContract, Witnesses } from "@midnight-ntwrk/compact-js";
import * as CompiledExampleContract from "./managed/example/contract/index.js";
import { PrivateState } from "./private-state.js";
import { contractConfig } from "./providers.js";
import { witnesses } from "./witnesses.js";

const tag = "ExampleContract";
const ContractConstructor = CompiledExampleContract.Contract<
  PrivateState,
  Witnesses<PrivateState>
>;
export type ContractType = CompiledExampleContract.Contract<
  PrivateState,
  Witnesses<PrivateState>
>;

export const CompactCompiledContract = CompiledContract.make<ContractType>(
  tag,
  ContractConstructor
).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath)
);

export { type ContractAddress } from "@midnight-ntwrk/compact-runtime";
export * from "./managed/example/contract/index.js";
export { createPrivateState, type PrivateState } from "./private-state.js";
export { configureProviders } from "./providers.js";
export { exampleContractPrivateStateKey } from "./types.js";
export type {
  ContractDerivedState,
  ExampleContractCircuitKeys,
  ExampleContractInstance,
  ExampleContractProviders,
  ExampleContractType,
  PrivateStateId
} from "./types.js";
export { witnesses };

