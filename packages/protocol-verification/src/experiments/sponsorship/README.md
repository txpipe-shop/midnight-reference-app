# Fixed-Price DUST Sponsorship

## Why this experiment exists

The initial Sentinel design assumed that a beneficiary with NIGHT but no DUST
could prepare a fixed-price Compact purchase, hand the finalized transaction to
a sponsor, and let the sponsor add only DUST without gaining control over the
beneficiary payment. Neither Compact compilation nor the wallet API alone
established that the resulting transaction would be guaranteed-only, safely
inspectable, and submit successfully.

## Claim

A Compact circuit can validate an exact shielded payment and sponsor identity,
record the purchase in guaranteed state, and be finalized without beneficiary
DUST. A second wallet can inspect it, add only DUST, and submit it.

## Preconditions

- Compact compiler `0.31.1`, language `0.23`.
- Ledger `8.0.3` and Midnight.js `4.1.1`.
- For the devnet runner: local node, indexer, and proof server at the shared
  standalone endpoints.
- Genesis wallet 1 funds the beneficiary; genesis wallet 3 supplies DUST.

## Contents

- `sponsorship.compact` — minimal fixed-price experiment contract.
- `sponsorship-contract.ts` — generated-contract wrapper.
- `sponsorship-runtime-check.ts` — deterministic state and rejection checks.
- `sponsorship-verification.ts` — full-ZK wallet/devnet runner.
- `result.json` — sanitized retained execution evidence.

## Procedure and acceptance rule

Compile with full ZK, verify deterministic accounting and invalid-payment
rejection, construct the call with a DUST-less beneficiary, round-trip and
inspect the finalized transaction, add only DUST with the sponsor wallet, and
submit it. The core claim passes only if the purchase has a guaranteed
transcript, no fallible transcript, the sponsor cannot alter bound call
actions, and the expected contract state commits.

Run from the repository root:

```sh
pnpm verify:protocol:local
pnpm verify:protocol:devnet:sponsorship
```

## Explicit result

**Mixed verdict, retained on 2026-07-24.** Fixed-price validation,
guaranteed-only partitioning, DUST-less beneficiary construction, structural
inspection, sponsor-only DUST balancing, and successful on-chain accounting
were confirmed. Action mutation was rejected. TTL mutation was not rejected
and had been accepted in an earlier run, so the stronger claim that every
transaction property was cryptographically immutable was refuted. Independent
stale-state rejection remained inconclusive. Production sponsor policy must
therefore validate TTL and current state itself. Exact evidence is in
`result.json`.
