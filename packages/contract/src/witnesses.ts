import { communicationCommitmentRandomness, fromHex, WitnessContext } from '@midnight-ntwrk/compact-runtime';
import { Ledger } from './managed/sentinel/contract/index.js';
import { PrivateState } from './private-state.js';

export type WitnessBase = WitnessContext<Ledger, PrivateState>;

export const witnesses = {
  secretKey: ({
    privateState,
  }: WitnessContext<Ledger, PrivateState>): [PrivateState, Uint8Array] => [
      privateState,
      privateState.secretKey,
    ],
  currentNonce: ({
    privateState,
  }: WitnessContext<Ledger, PrivateState>): [PrivateState, Uint8Array] => {
    const nonceHex = communicationCommitmentRandomness();
    const nonce = fromHex(nonceHex).slice(0, 32);
    return [privateState, nonce];
  },
};
