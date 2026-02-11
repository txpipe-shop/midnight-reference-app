import { type ContractAddress } from "@midnight-ntwrk/compact-runtime";
import { type FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import { type MidnightProviders } from "@midnight-ntwrk/midnight-js-types";
import { Observable } from "rxjs";
import { Contract, Witnesses } from "./managed/example/contract/index.js";
import { PrivateState } from "./private-state.js";

// Combination of public and private state
export type ContractDerivedState = {
  readonly counter: bigint;
};

export interface DeployedContract {
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<ContractDerivedState>;

  returnTrue(): Promise<boolean>;
}

export type ExampleContractType = Contract<
  PrivateState,
  Witnesses<PrivateState>
>;
export type DeployedExampleContract = FoundContract<ExampleContractType>;

export const exampleContractPrivateStateKey = "exampleContractPrivateState";
export type PrivateStateId = typeof exampleContractPrivateStateKey;

export type ExampleContractCircuitKeys = Exclude<
  keyof ExampleContractType["impureCircuits"],
  number | symbol
>;
export type ExampleContractProviders = MidnightProviders<
  ExampleContractCircuitKeys,
  PrivateStateId,
  PrivateState
>;
