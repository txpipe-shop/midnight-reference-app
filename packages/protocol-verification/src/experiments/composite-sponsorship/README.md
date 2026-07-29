# Composite Sponsorship Transaction

## Why this experiment exists

Real sponsored transactions contain user contract behavior as well as the
sponsorship purchase. The important uncertainty was whether multiple custom
calls could be merged, retain their guaranteed/fallible boundaries, receive a
DUST contribution from a separate wallet, and produce both
`SucceedEntirely` and `FailFallible` without losing guaranteed purchase state.

## Claim

A beneficiary transaction containing a custom target call and sponsorship
purchase can be merged and sponsored with DUST only. Guaranteed effects commit
in both complete success and fallible failure, while the target fallible effect
commits only on complete success.

## Preconditions

- Compact compiler `0.31.1`, language `0.23`.
- Ledger `8.0.3`, Midnight.js `4.1.1`.
- Local node, indexer, and proof server.
- Funded genesis wallets for beneficiary assets and sponsor DUST.

## Contents

- `composite-sponsorship.compact` — sponsorship fixture.
- `composite-target.compact` — target with guaranteed and fallible behavior.
- `composite-sponsorship-contract.ts` — wrappers and combined proof provider.
- `sponsorship-composite-verification.ts` — full-ZK devnet runner.
- `result.json` — sanitized retained execution evidence.

## Procedure and acceptance rule

Deploy both fixtures, fund an otherwise DUST-less beneficiary, construct and
merge the target and purchase calls, inspect their commitments, add only DUST,
and submit one successful target call and one deliberately failing fallible
call. Pass requires three intents after sponsorship, `SucceedEntirely` and
`FailFallible` statuses respectively, two committed purchases, two guaranteed
target executions, one fallible target execution, and only one recipient
transfer.

Run:

```sh
pnpm verify:protocol:devnet:composite
```

## Explicit result

**Confirmed on 2026-07-24.** Both transactions were accepted with the expected
statuses. Sponsor revenue reached `200`, purchase and receipt counts reached
`2`, guaranteed target executions reached `2`, fallible executions reached
`1`, and the recipient increased by `50`. Exact versions, contract addresses,
transaction IDs, commitments, and state deltas are retained in `result.json`.
