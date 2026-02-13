import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { contractConfig } from "./providers.js";
import { ExampleContractConstructor, ExampleContractType } from "./types.js";
import { witnesses } from "./witnesses.js";

const tag = "ExampleContract";
export const CompactCompiledContract =
  CompiledContract.make<ExampleContractType>(
    tag,
    ExampleContractConstructor
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
  ExampleContractCircuitKeys,
  ExampleContractDeployed,
  ExampleContractProviders,
  ExampleContractType,
  PrivateStateId
} from "./types.js";
export { witnesses };

