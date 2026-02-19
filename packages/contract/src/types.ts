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

// NOTE: maybe there is a better way to access this types but I did not want to waste time on that just yet
export type SentinelRules = Parameters<SentinelContractType["initialState"]>[1];

// NOTE: Compact doesn't generate enums (maybe there is a config somewhere in the universe to generate it)
export enum SentinelOrdOp {
  GT = 0,
  LT = 1,
  EQ = 2,
  NEQ = 3,
  GTE = 4,
  LTE = 5,
}
export enum SentinelEqOp {
  EQ = 0,
  NEQ = 1,
}
