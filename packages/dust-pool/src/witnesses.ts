import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger, Witnesses } from './managed/pool/contract/index.js';

/** The private opening of one DUST UTXO, as the pool contract's circuits read it. */
export interface NoteOpening {
  readonly initialValue: bigint;
  readonly nonce: bigint;
  /** Creation time in whole seconds since the Unix epoch. */
  readonly ctimeSeconds: bigint;
}

export interface PoolPrivateState {
  /** The pool's DUST secret key. Only the operator's wallet holds it. */
  readonly dustSecretKey: bigint;
  /** The note being published by the next `enroll` or `settle` call. */
  readonly opening?: NoteOpening;
}

type Ctx = WitnessContext<Ledger, PoolPrivateState>;

export const witnesses: Witnesses<PoolPrivateState> = {
  dustSecretKey: ({ privateState }: Ctx): [PoolPrivateState, bigint] => [
    privateState,
    privateState.dustSecretKey,
  ],
  noteOpening: ({ privateState }: Ctx): [PoolPrivateState, [bigint, bigint, bigint]] => {
    const opening = privateState.opening;
    if (!opening) {
      throw new Error('no note opening was supplied for this call');
    }
    return [privateState, [opening.initialValue, opening.nonce, opening.ctimeSeconds]];
  },
  // The contract checks q * d <= n < (q + 1) * d, so any other answer is rejected.
  quotient: (
    { privateState }: Ctx,
    numerator: bigint,
    denominator: bigint
  ): [PoolPrivateState, bigint] => [privateState, numerator / denominator],
};
