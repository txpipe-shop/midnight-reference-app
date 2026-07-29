# Two-Circuit Reward Split

## Why this experiment exists

A single Compact call that received `2 NIGHT` and immediately sent `1 NIGHT`
to both recipients became fallible. The economically required behavior was
different: the delegator reward and queue advance had to be guaranteed, while
the sponsor reward and subsequent user interaction could be fallible. It was
also unknown whether contract-created shielded outputs could be discovered and
spent by ordinary recipient wallets.

## Claim

One transaction can order three Compact calls:

1. `purchaseDelegatorReward` — guaranteed-only, pays `1 NIGHT` and advances
   the public round-robin cursor.
2. `deliverSponsorReward` — fallible-only, pays `1 NIGHT` to the sponsor and
   records the receipt.
3. `userInteraction` — fallible target behavior.

Recipient wallets must discover the created outputs, and the rotation and
receipt metadata must remain deterministic.

## Preconditions

- Compact compiler `0.31.1`, language `0.23`.
- Ledger `8.0.3`, Midnight.js `4.1.1`.
- Wallet-derived coin and encryption public keys supplied through the SDK’s
  additional encryption-key mapping.
- Local proof server and devnet for the full wallet runner.

## Contents

- `reward-split.compact` — queue and two reward circuits.
- `fallible-user-target.compact` — third-call failure fixture.
- `*-contract.ts` — generated-contract wrappers and proof routing.
- `reward-split-runtime-check.ts` — deterministic queue/state checks.
- `reward-split-partition-check.ts` — transcript and merge inspection.
- `reward-split-wallet-check.ts` — full-ZK wallet discovery/devnet runner.
- `result.json` — sanitized retained execution evidence.

## Procedure and acceptance rule

Compile all circuits, test empty queues, operator authorization and rotation,
three-delegator wraparound, removal compaction, and receipt binding. Build the
three ordered calls and require guaranteed-only delegator delivery plus
fallible-only sponsor and target calls. Submit both complete-success and
fallible-failure transactions. The sponsor must receive only the successful
reward; the delegator must receive both guaranteed rewards.

Run:

```sh
pnpm verify:protocol:local
pnpm verify:protocol:reward-split
```

## Explicit result

**Confirmed on 2026-07-27.** Full-ZK compilation succeeded. Partitioning was
delegator guaranteed-only, sponsor fallible-only, and user interaction
fallible-only. Rotation was `A → B → C → A`; compaction, operator rotation, and
receipt binding passed. The successful transaction was `SucceedEntirely`; the
deliberate fallible failure was `FailFallible`. The sponsor balance increased
by `1`, while the delegator balance increased by `2`, proving discovery of both
guaranteed outputs. Exact evidence is in `result.json`.
