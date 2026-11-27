// The pool auditor. It needs no secret and no honest operator: it reads only
// public data — the pool contract's ledger state and the DUST events of the
// pool's key — and reports whether the operator behaved.
//
// Two facts a contract cannot check on ledger 9 (it cannot read DUST state),
// so the auditor checks them from outside:
//
//  1. Every DUST UTXO the pool key spent on chain was a fill. The contract
//     records, in `spentNullifiers`, the nullifier of each note a `settle`
//     consumed. The ledger emits a `dustSpendProcessed` event, carrying a
//     nullifier, for every DUST spend. A spend under the pool key whose
//     nullifier is not in `spentNullifiers` is pooled DUST the operator spent
//     for something other than a pool fill: a diversion.
//
//  2. Each fill paid at least the price floor. `settle` enforces this in
//     circuit, but the auditor re-checks it against the recorded fee so the
//     guarantee does not rest on trusting the deployed circuit.
//
// The operator cannot pass the audit while cheating: to spend pooled DUST it
// must produce the note's nullifier on chain, and the only way to get that
// nullifier into `spentNullifiers` is a `settle`, which forces the payment
// into the contract at the floor price.

export interface SpentNote {
  /** The nullifier the fill consumed, as recorded in the contract. */
  readonly nullifier: bigint;
  /** The fee that fill declared, in Specks. */
  readonly fee: bigint;
  /** The payment it took, in units of 1000 Stars. */
  readonly units: bigint;
}

/** A DUST spend observed on chain under the pool's key (from a `dustSpendProcessed` event). */
export interface ObservedSpend {
  readonly nullifier: bigint;
  readonly vFee: bigint;
}

export interface AuditInput {
  /** Nullifiers the contract recorded as settled, with the fee and payment each took. */
  readonly settled: ReadonlyArray<SpentNote>;
  /** Every DUST spend the pool key made on chain, from the indexer. */
  readonly observed: ReadonlyArray<ObservedSpend>;
  /** The campaign's price floor: Stars of NIGHT per DUST. */
  readonly starsPerDust: bigint;
}

export interface Diversion {
  readonly nullifier: bigint;
  readonly vFee: bigint;
}

export interface Underpayment {
  readonly nullifier: bigint;
  readonly fee: bigint;
  readonly units: bigint;
  readonly requiredUnits: bigint;
}

export interface AuditReport {
  readonly ok: boolean;
  /** Spends under the pool key that no `settle` accounts for: diverted DUST. */
  readonly diversions: Diversion[];
  /** Fills recorded below the price floor (should be impossible if the deployed circuit is honest). */
  readonly underpayments: Underpayment[];
  /** Settled nullifiers with no matching on-chain spend yet (benign: not observed, or pending). */
  readonly unobserved: bigint[];
}

const STARS_PER_UNIT = 1_000n;
const SPECKS_PER_DUST = 1_000_000_000_000_000n;

/** The smallest payment, in units of 1000 Stars, that meets the floor for a fee. */
export const requiredUnits = (vFee: bigint, starsPerDust: bigint): bigint => {
  const numerator = vFee * starsPerDust;
  const denominator = STARS_PER_UNIT * SPECKS_PER_DUST;
  return (numerator + denominator - 1n) / denominator;
};

export const audit = (input: AuditInput): AuditReport => {
  const settledByNullifier = new Map<bigint, SpentNote>();
  for (const note of input.settled) {
    settledByNullifier.set(note.nullifier, note);
  }
  const observedNullifiers = new Set(input.observed.map((s) => s.nullifier));

  const diversions: Diversion[] = [];
  for (const spend of input.observed) {
    if (!settledByNullifier.has(spend.nullifier)) {
      diversions.push({ nullifier: spend.nullifier, vFee: spend.vFee });
    }
  }

  const underpayments: Underpayment[] = [];
  for (const note of input.settled) {
    const required = requiredUnits(note.fee, input.starsPerDust);
    if (note.units < required) {
      underpayments.push({
        nullifier: note.nullifier,
        fee: note.fee,
        units: note.units,
        requiredUnits: required,
      });
    }
  }

  const unobserved = input.settled
    .map((n) => n.nullifier)
    .filter((n) => !observedNullifiers.has(n));

  return {
    ok: diversions.length === 0 && underpayments.length === 0,
    diversions,
    underpayments,
    unobserved,
  };
};
