# Production Sentinel Sponsorship Regression

## Why this experiment exists

Feasibility fixtures are insufficient once their design is promoted. This
experiment applies the retained runtime and composite-transaction checks to
the actual Sentinel contract so changes to production state, receipts, queue
logic, or partitioning cannot be mistaken for continued feasibility.

## Claim

Production Sentinel preserves fixed `1 + 1 NIGHT` pricing, deterministic
delegator rotation, receipt metadata, removal compaction, operator rotation,
pause enforcement, and the intended behavior when composed with a fallible
target and DUST sponsor.

## Preconditions

- A freshly compiled production Sentinel from `packages/contract`.
- The composite target fixture from the sibling experiment.
- Compact `0.31.1`, ledger `8.0.3`, Midnight.js `4.1.1`.
- Local node, indexer, and proof server for the devnet runner.

## Contents

- `sentinel-sponsorship-runtime-check.ts` — deterministic production state
  regression.
- `sentinel-sponsorship-partition-check.ts` — retained non-gating partition
  probe for focused investigation.
- `sponsorship-production-verification.ts` — full-ZK production devnet runner.
- `result.json` — sanitized retained execution evidence.

## Procedure and acceptance rule

Run deterministic queue, receipt, rotation, removal, and pause checks against
generated production bindings. For the devnet check, deploy Sentinel and the
target, fund the beneficiary, prepare and structurally inspect sponsored
transactions, add only DUST, and submit complete-success and deliberate
fallible-failure cases. Both purchases and guaranteed target effects must
commit; only one fallible target effect may commit.

Run:

```sh
pnpm verify:protocol:local
pnpm verify:protocol:devnet:production
```

## Explicit result

**Confirmed on 2026-07-27.** Deterministic production runtime checks passed.
The devnet transactions produced `SucceedEntirely` and `FailFallible`.
Production sponsorship revenue reached `200`, purchases and receipts reached
`2`, guaranteed target executions reached `2`, and fallible target executions
reached `1`. Exact versions, deployments, transaction IDs, and state evidence
are retained in `result.json`. The separate partition probe is intentionally
non-gating because it is investigative rather than part of this recorded
confirmed verdict.
