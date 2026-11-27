# DUST pool (ledger 9)

A passive liquidity pool for DUST. Delegators register their NIGHT to the
pool's DUST public key and do nothing else. The operator's wallet holds the
DUST secret key and only signs: it pays other people's fees and is paid for it.
All revenue lands in this contract and is split pro rata to the NIGHT that
backed the pool. The operator is **untrusted for custody and for honesty of
accounting**, and trusted only to stay online; a public auditor catches it if
it diverts pooled DUST.

This package is a design under verification, not production code. It targets
Compact `0.36.1` and ledger 9 (`@midnightntwrk/ledger-v9` `1.0.2`).

## Why only the signing wallet is trusted, and only weakly

On ledger 9 a fee can be paid only by a DUST spend (which needs the DUST secret
key) or a NIGHT-key signature. A contract can hold neither key, so some wallet
must be online to sign. That wallet is the one irreducible operator. Everything
else is removed:

- **Custody.** The operator never holds a delegator's NIGHT. The NIGHT stays in
  the delegator's own wallet; registration only points its DUST generation at
  the pool's key, and the delegator can repoint it at any time with one
  transaction.
- **Revenue.** Every fill pays the contract, not the operator. The split is
  computed on chain from public per-epoch NIGHT. The operator takes only its
  sealed fee, and only through the same `payout` path everyone uses.
- **Honesty.** The operator could spend pooled DUST to pay its own fees instead
  of filling for the pool. It cannot do so invisibly: see the auditor below.

The worst a malicious operator can do is withhold service or divert DUST it
should have sold — both detectable, and neither touches a delegator's NIGHT.

## How it works

1. **Join (delegator, once).** The delegator registers a NIGHT UTXO to the
   pool's DUST key, paying the registration fee from the DUST that NIGHT already
   accrued while unregistered. No DUST needed up front, and the NIGHT never
   moves. The operator calls `enroll`, publishing the new DUST note.
2. **Fill (operator, per request).** A beneficiary builds a transaction that
   leaves a NIGHT payment unclaimed. The operator merges in a fee intent: a DUST
   spend that pays the whole fee, a claim of the payment into the contract via
   `settle`, and a second (blinding) intent. The ledger's balance check settles
   the two atomically — the payment covers the fee or the transaction is
   invalid.
3. **Distribute (anyone).** `closeEpoch` splits each epoch's revenue pro rata to
   active NIGHT after the operator fee; `claim` moves a note's share to its
   owner's credit; `payout` sends a credit to the address that earned it, so a
   delegator's wallet can stay cold.

See `src/pool.compact`. The settlement mechanics and the two-part binding rule
are described in the design doc this package implements.

## The auditor needs no trust

A contract on ledger 9 cannot read DUST state, so it cannot verify that the
operator only ever spent pooled DUST on fills. The auditor (`src/auditor.ts`)
checks that from **public data alone** — no secret, no cooperation from the
operator:

- `settle` records, in the contract's `spentNullifiers`, the nullifier of every
  DUST note it consumed.
- The ledger emits a `dustSpendProcessed` event, carrying a nullifier, for every
  DUST spend. An indexer lists the pool key's spends.
- Any spend under the pool key whose nullifier is **not** in `spentNullifiers`
  is pooled DUST spent off-pool: a diversion. The auditor reports it.

The operator cannot both spend a pooled note and pass the audit: producing the
note's nullifier on chain is unavoidable, and the only way that nullifier enters
`spentNullifiers` is a `settle`, which forces the payment into the contract at
the floor price.

## What is verified, and what is not

Everything in `test/` runs in process against the **real ledger 9
implementation** (`@midnightntwrk/ledger-v9`) and the **real Compact 0.36.1
compiler**. Run it:

```sh
pnpm --filter @midnight-sentinel/dust-pool test
```

| Area                                                                                     | How it is checked                                                                                                        | File                                             |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| In-circuit DUST commitment and nullifier equal the ledger's                              | The compiled circuit's `dustCommitment` / `dustNullifier` vs `ledger.dustCommitment` / `dustNullifier` over random notes | `test/dust-hash.test.ts`                         |
| Contract logic: enroll, price floor, pro-rata split, retire, payout, dishonest witnesses | The contract run in the Compact runtime (`src/simulator.ts`)                                                             | `test/pool-contract.test.ts`                     |
| A delegator joins with no DUST, by self-funded registration to the pool key              | Applied to a real `LedgerState`; balances and DUST events checked                                                        | `test/ledger-shapes.test.ts`                     |
| A fill settles across intents (payment nets to zero, DUST covers the fee)                | The ledger's own `imbalances()` / `fees()`                                                                               | `test/ledger-shapes.test.ts`                     |
| The operator's spend/commitment equal what `settle` stores                               | `ledger.dustNullifier` / `dustCommitment` of the spent and successor UTXOs                                               | `test/ledger-shapes.test.ts`                     |
| Merge combines binding randomness symmetrically (basis of the two-part rule)             | `bindingRandomness` under reordered merges                                                                               | `test/ledger-shapes.test.ts`                     |
| The auditor passes an honest pool and catches a diversion                                | End to end, contract plus auditor                                                                                        | `test/e2e-audit.test.ts`, `test/auditor.test.ts` |

**Not verified in process, and why.** There is no proof server here, so no ZK
proof is generated or verified. That means two things are left to a devnet:

- **Applying a DUST-spend transaction.** The ledger's time-to-dismiss bound is
  sized for a proven transaction, and transcript partitioning (which arranges a
  real transaction to fit the guaranteed-section budget) runs in the proof path.
  So fills are checked by `imbalances()` (the exact balance rule) but not
  applied. Registration, which spends no DUST, **is** applied for real.
- **The two-part rule itself.** The harness confirms that merge combines
  binding randomness symmetrically, which is why a single contributed intent is
  isolable. Whether an isolated value can actually be re-bound to a new payload
  is a property of the real Pedersen/Schnorr crypto and must be settled with the
  proof server (experiments VP-1 / VP-2 in the design doc).

## Running on a devnet

The devnet is not run as part of this package's tests (it needs the node,
indexer and proof-server images, which this environment cannot pull).

1. Confirm the image tags in `compose.ledger9.yml` against the registry (the
   support matrix gives versions, not tags), then start the services:
   ```sh
   docker compose -f packages/dust-pool/compose.ledger9.yml up -d
   ```
2. Build full-ZK contract artifacts:
   ```sh
   pnpm --filter @midnight-sentinel/dust-pool compact
   ```
3. Check everything is ready:
   ```sh
   pnpm --filter @midnight-sentinel/dust-pool devnet:preflight
   ```
4. Deploy and exercise the flow (deploy, register a delegator to the pool key,
   run a fill, close an epoch, run the auditor). This step reuses the provider
   and wallet wiring from `apps/sponsor-service` and `packages/wallet`, upgraded
   to the ledger 9 SDK; it is the natural home for VP-1 through VP-4.
