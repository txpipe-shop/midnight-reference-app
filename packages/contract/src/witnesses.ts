import { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import { Ledger } from './managed/sentinel/contract/index.js';
import { PrivateState } from './private-state.js';

export type WitnessBase = WitnessContext<Ledger, PrivateState>;

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, PrivateState>): [PrivateState, Uint8Array] => [
      privateState,
      privateState.secretKey,
    ],
};
