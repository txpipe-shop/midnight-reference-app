import { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import { Ledger } from "./managed/example/contract/index.js";
import { PrivateState } from "./private-state.js";

export type WitnessBase = WitnessContext<Ledger, PrivateState>;

/* **********************************************************************
 * The witnesses object for a contract is an object with a field for each
 * witness function, mapping the name of the function to its implementation.
 *
 * The implementation of each function always takes as its first argument
 * a value of type WitnessContext<L, PS>, where L is the ledger object type
 * that corresponds to the ledger declaration in the Compact code, and PS
 * is the private state type.
 *
 * A WitnessContext has three fields:
 *  - ledger: T
 *  - privateState: PS
 *  - contractAddress: string
 *
 * The other arguments (after the first) to each witness function
 * correspond to the ones declared in Compact for the witness function.
 * The function's return value is a tuple of the new private state and
 * the declared return value.  In this case, that's a PrivateState
 * and a Boolean (because the contract declared a return value
 * of Boolean).
 */
export const witnesses = {
  foo: (context: WitnessBase, x: boolean): [PrivateState, boolean] => [context.privateState, x],
};