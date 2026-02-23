import type { ContractProviders } from "@midnight-ntwrk/midnight-js-contracts";
import {
  type DeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { Contract, Witnesses } from "./managed/sentinel/contract/index.js";
import { PrivateState } from "./private-state.js";

export const SentinelContractConstructor = Contract<
  PrivateState,
  Witnesses<PrivateState>
>;
export type SentinelContractType = InstanceType<
  typeof SentinelContractConstructor
>;

export type SentinelContractDeployed =
  | DeployedContract<SentinelContractType>
  | FoundContract<SentinelContractType>;

export const sentinelContractPrivateStateKey = "sentinelContractPrivateState";
export type PrivateStateId = typeof sentinelContractPrivateStateKey;

export type SentinelContractCircuitKeys = Exclude<
  keyof SentinelContractType["impureCircuits"],
  number | symbol
>;

export type SentinelContractProviders = ContractProviders<SentinelContractType>;
