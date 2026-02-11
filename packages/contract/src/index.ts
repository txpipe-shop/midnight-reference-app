import { CompiledContract, Witnesses } from "@midnight-ntwrk/compact-js";
import * as CompiledExampleContract from "./managed/example/contract/index.js";
import { PrivateState } from "./private-state.js";
import { witnesses } from "./witnesses.js";

const tag = "ExampleContract";
const ContractConstructor = CompiledExampleContract.Contract<
  PrivateState,
  Witnesses<PrivateState>
>;
type ContractType = CompiledExampleContract.Contract<
  PrivateState,
  Witnesses<PrivateState>
>;

export const CompactCompiledContract = CompiledContract.make<ContractType>(
  tag,
  ContractConstructor
).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets("./compiled/example")
);

export * from "./managed/example/contract/index.js";
export { createPrivateState, type PrivateState } from "./private-state.js";
export { exampleContractPrivateStateKey } from "./types.js";
export type {
  ContractDerivedState,
  DeployedContract,
  DeployedExampleContract,
  ExampleContractCircuitKeys,
  ExampleContractProviders,
  ExampleContractType,
  PrivateStateId
} from "./types.js";
export { witnesses };

