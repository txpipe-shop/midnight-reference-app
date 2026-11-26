import {
  dustCommitment,
  dustNullifier,
  type DustSecretKey,
  type QualifiedDustOutput,
} from '@midnightntwrk/ledger-v9';
import type { NoteOpening } from './witnesses.js';

/** What the pool contract stores for a DUST UTXO: both values are public. */
export interface PublishedNote {
  readonly cm: bigint;
  readonly nul: bigint;
}

/** The witness the contract needs in order to recompute a UTXO's commitment and nullifier. */
export const openingOf = (utxo: QualifiedDustOutput): NoteOpening => {
  const millis = utxo.ctime.getTime();
  if (millis % 1000 !== 0) {
    throw new Error('DUST creation times are whole seconds');
  }
  return {
    initialValue: utxo.initialValue,
    nonce: utxo.nonce,
    ctimeSeconds: BigInt(millis / 1000),
  };
};

/** The commitment and nullifier the ledger itself assigns to a DUST UTXO. */
export const publishedNoteOf = (utxo: QualifiedDustOutput, sk: DustSecretKey): PublishedNote => ({
  cm: dustCommitment(utxo),
  nul: dustNullifier(utxo, sk),
});

export const STARS_PER_NIGHT = 1_000_000n;
export const SPECKS_PER_DUST = 1_000_000_000_000_000n;
/** The contract counts payments in units of 1000 Stars (0.001 NIGHT). */
export const STARS_PER_UNIT = 1_000n;

/** The smallest payment, in contract units, that meets a pool's price floor for a fee. */
export const minimumUnits = (vFeeSpecks: bigint, starsPerDust: bigint): bigint => {
  const numerator = vFeeSpecks * starsPerDust;
  const denominator = STARS_PER_UNIT * SPECKS_PER_DUST;
  return (numerator + denominator - 1n) / denominator;
};
