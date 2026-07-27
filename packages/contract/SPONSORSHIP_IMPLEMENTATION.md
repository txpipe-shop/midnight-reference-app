# Sentinel Sponsorship v1

## Scope

This implementation turns the composite sponsorship experiment into a reusable
vertical slice. It intentionally supports one immutable sponsor and one
immutable campaign per Sentinel deployment.

The production Sentinel contract now owns:

- the sponsor's DUST public key;
- the accepted shielded token color and exact price;
- a hash of the off-chain target allowlist;
- pause/resume state;
- cumulative revenue and purchase count;
- public receipts keyed by a client-generated purchase ID;
- sponsor-side replay protection preventing the same target communication
  commitment from being accepted twice.

The experiment contracts and TypeScript runners under `src/verification` and
`apps/cli/src/verification` remain retained as reproducibility evidence.
Generated scratch compiler directories are deliberately not retained.

## Transaction architecture

```text
Beneficiary
  prepared unproven target call
          +
  Sentinel.purchaseSponsorship(
    purchaseId,
    exact shielded payment,
    target address,
    target entry-point hash,
    target communication commitment
  )
          |
          v
  merge -> prove -> balance shielded/unshielded only
          |
          v
  finalized request with no DUST

Sponsor
  deserialize and round-trip
  enforce exactly two calls and no unrelated transfers
  enforce target allowlist, campaign, TTL, and fee cap
  replay the guaranteed purchase transcript against current Sentinel state
  verify the exact receipt/accounting delta
          |
          v
  balance only ['dust']
  inspect again and compare target binding
          |
          v
  submit and await indexed finality
```

The target call may contain guaranteed and fallible transcripts. The Sentinel
purchase is guaranteed-only. Therefore a target `FailFallible` still records
the paid sponsorship receipt, while any guaranteed failure rejects the entire
transaction and commits neither payment nor DUST.

## Public API

`@midnight-sentinel/api/sponsorship` is the stable, SDK-independent domain
surface. It exports:

- `BeneficiarySponsorshipApi.prepare` for beneficiary-side composition;
- `SponsorSponsorshipApi.inspect` for independent policy enforcement;
- `SponsorSponsorshipApi.sponsorAndSubmit` for DUST-only balancing, final
  inspection, submission, and indexer confirmation;
- `sponsorshipAllowlistHash` for canonical single- or multi-target allowlists;
- `SponsorshipError`, with structured `code`, `stage`, `retryable`, and safe
  JSON fields;
- request, policy, inspection, and submission domain types containing only
  serialized bytes and sponsorship metadata.

`@midnight-sentinel/api/sponsorship/midnight` is the platform adapter. It owns
the Wallet SDK, provider, unproven-call, and ZK configuration types and creates
the stable beneficiary and sponsor capabilities. A target call becomes an
opaque `SponsorshipTargetCall` before crossing into the domain API. Neither
preparation nor inspection returns a raw ledger transaction or generated
Compact receipt.

## Operator lifecycle

The CLI deploy flow asks for a price and initial allowed target. The allowlist
hash is placed in the immutable campaign configuration. The circuit menu can
pause or resume sponsorship.

The sponsor CLI path asks for the approved target, fee cap, and serialized
beneficiary request. It does not use the old blind `zswapSponsor` path: it calls
the policy inspector, adds only DUST, inspects the result again, then submits.

DUST registration/replenishment remains an explicit wallet/operator concern.
Sponsorship payments remain a contract sink in v1; treasury recovery was
removed because its additional guaranteed-dismissal cost moved the complete
purchase transcript into the fallible segment.

## Verification commands

From `packages/contract`:

```text
compact compile +0.31.1 --skip-zk src/sentinel.compact ./src/managed/sentinel
node --import ../../apps/cli/node_modules/tsx/dist/loader.mjs \
  src/verification/sentinel-sponsorship-runtime-check.ts
../../node_modules/.bin/tsc --noEmit -p tsconfig.build.json
../../node_modules/.bin/tsc --noEmit -p ../api/tsconfig.json
../../node_modules/.bin/tsc --noEmit -p ../../apps/cli/tsconfig.build.json
```

The runtime check covers exact payment accounting, receipt binding, duplicate
purchase IDs, wrong asset/amount, and pause enforcement. Duplicate target
commitments are rejected by sponsor inspection against existing receipts.

The retained composite devnet harness remains the evidence for combining two
custom calls, preserving the target's guaranteed/fallible partition, adding
only DUST, `SucceedEntirely`, and `FailFallible`. A fresh devnet run of the new
production API path completed with verdict `CONFIRMED`; its sanitized evidence
is retained under `verification/results`.
