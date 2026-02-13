import type { ContractProviders } from "@midnight-ntwrk/midnight-js-contracts";
import {
  type DeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { Contract, Witnesses } from "./managed/example/contract/index.js";
import { PrivateState } from "./private-state.js";

// Combination of public and private state
export type ContractDerivedState = {
  readonly counter: bigint;
};

export type ExampleContractType = Contract<
  PrivateState,
  Witnesses<PrivateState>
>;
export type ExampleContractInstance =
  | DeployedContract<ExampleContractType>
  | FoundContract<ExampleContractType>;

export const exampleContractPrivateStateKey = "exampleContractPrivateState";
export type PrivateStateId = typeof exampleContractPrivateStateKey;

export type ExampleContractCircuitKeys = Exclude<
  keyof ExampleContractType["impureCircuits"],
  number | symbol
>;

export type ExampleContractProviders = ContractProviders<ExampleContractType>