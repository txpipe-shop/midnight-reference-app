# Midnight Protocol Verification Lab

This private workspace package retains protocol experiments used to prove or
refute behavior that is not obvious from Compact or Midnight SDK APIs alone.
It is not published and none of its experimental contracts are production
Sentinel code.

## Experiments

| Experiment                                                                 | Question                                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`sponsorship`](src/experiments/sponsorship/README.md)                     | Can a beneficiary prepare a payment call and a sponsor add only DUST?            |
| [`composite-sponsorship`](src/experiments/composite-sponsorship/README.md) | How do guaranteed and fallible calls behave when merged?                         |
| [`reward-split`](src/experiments/reward-split/README.md)                   | Can two circuits deliver the intended reward partition and discoverable outputs? |
| [`production-sentinel`](src/experiments/production-sentinel/README.md)     | Do the retained properties hold against the production contract?                 |

The experiments are pinned to Compact `0.31.1` and the dependency versions in
this package. Compilation alone is never treated as end-to-end evidence.

## Commands

From the repository root:

```sh
pnpm verify:protocol:local
pnpm verify:protocol:reward-split
pnpm verify:protocol:devnet:sponsorship
pnpm verify:protocol:devnet:composite
pnpm verify:protocol:devnet:production
```

`verify:protocol:local` runs deterministic no-ZK runtime and transcript checks.
Commands containing `devnet` require the local node, indexer, and proof server.
The reward-split wallet experiment also requires full proving infrastructure.
Each directory under `src/experiments` is self-contained: Compact fixtures,
TypeScript wrappers and runners, a standalone explanation, and the sanitized
result live together. Shared standalone configuration and generated contract
artifacts remain under `src/common` and `src/managed`.

## Retention rule

Each experiment must keep its question, acceptance or stop conditions,
versions, sanitized result, and relationship to production behavior. Generated
artifacts, wallet databases, secrets, and transient live reports are ignored.
