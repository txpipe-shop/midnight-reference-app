import { CompiledContract, Witnesses } from "@midnight-ntwrk/compact-js";
import * as CompiledExampleContract from "./managed/example/contract/index";
import { PrivateState } from "./private-state";
import { witnesses } from "./witnesses";

const tag = "ExampleContract";
const ContractConstructor = CompiledExampleContract.Contract<
  PrivateState,
  Witnesses<PrivateState>
>;
type ContractType = CompiledExampleContract.Contract<
  PrivateState,
  Witnesses<PrivateState>
>

export const CompactCompiledContract = CompiledContract.make<ContractType>(tag, ContractConstructor).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets("./compiled/example")
);

export * from "./managed/example/contract/index";
export { createPrivateState, type PrivateState } from "./private-state";
export { witnesses };

