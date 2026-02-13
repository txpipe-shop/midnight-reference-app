import { Witnesses } from "@midnight-ntwrk/compact-js";
import type { ContractProviders } from "@midnight-ntwrk/midnight-js-contracts";
import {
  type DeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { Contract } from "./managed/example/contract/index.js";
import { PrivateState } from "./private-state.js";

// Represents the contract class with its corresponding defined types (private state and witnesses).
export const ExampleContractConstructor = Contract<
  PrivateState,
  Witnesses<PrivateState>
>;
export type ExampleContractType = InstanceType<typeof ExampleContractConstructor>;

// Represents a deployed or a found contract in the blockchain.
// After correctly using `deployContract()` or `findDeployContract()` you will obtain an instance of this type.
export type ExampleContractDeployed =
  | DeployedContract<ExampleContractType>
  | FoundContract<ExampleContractType>;

// Represents the private state key used to store or retrieve the private state in the blockchain.
// TODO: Expand this explanation with more information.
export const exampleContractPrivateStateKey = "exampleContractPrivateState";
export type PrivateStateId = typeof exampleContractPrivateStateKey;

// Represents the exported (impure) circuits of the contract.
export type ExampleContractCircuitKeys = Exclude<
  keyof ExampleContractType["impureCircuits"],
  number | symbol
>;

// Represents the providers for the contract.
// Providers are the objects that are used to interact with the contract.
// You can find more information in the `midnight-js-types` package (MidnightProviders interface)
export type ExampleContractProviders = ContractProviders<ExampleContractType>;
