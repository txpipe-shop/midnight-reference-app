# Sentinel Sponsor Eligibility Service

The service accepts signed Midnight enrollment requests, reconstructs current
registered NIGHT from finalized indexer data, and serializes eligibility queue
mutations for one Sentinel deployment.

For a running local devnet (node, indexer, and proof server), the complete
setup is one command:

```sh
pnpm --filter @midnight-sentinel/sponsor-service setup:devnet
```

It uses the known funded devnet wallets, generates a distinct circuit operator
secret, deploys an `interact` target and a new Sentinel campaign, derives the
sponsor DUST address, and writes `apps/sponsor-service/.env` with mode `0600`.
The service loads this file automatically. Start it with:

```sh
pnpm --filter @midnight-sentinel/sponsor-service dev
```

The setup requires the full-ZK Sentinel and composite-target artifacts in
`packages/contract/dist/managed`. The resulting `.env` is local-devnet
configuration and must not be reused for a public network. It will not replace
an existing environment unless you explicitly append `-- --force`.

For manual or non-devnet setup, the required environment variables are:

- `SERVICE_ADMIN_TOKEN` — at least 24 characters.
- `SERVICE_OPERATOR_SEED` — the 32-byte transaction wallet seed.
- `SERVICE_OPERATOR_SECRET` — the 32-byte circuit authority secret. Keep this
  separate from the wallet seed and never publish it.
- `SERVICE_PRIVATE_STATE_STORE` — encrypted private-state store name used by
  the service.
- `SENTINEL_ADDRESS` — deployed Sentinel contract address.
- `SPONSOR_DUST_ADDRESS` — campaign sponsor DUST address.
- `EXPECTED_OPERATOR_AUTHORITY` — public authority stored in the contract.

Indexer, node, proof server, database, host, port, network, and revalidation
interval have local-devnet defaults.

Generate a circuit secret and the corresponding public deployment/rotation
authority with:

```sh
pnpm --filter @midnight-sentinel/sponsor-service operator:bootstrap
```

Use `operatorAuthority` when deploying Sentinel or rotating its operator. Set
the matching `operatorSecret` as `SERVICE_OPERATOR_SECRET`, configure the
remaining environment variables, and start the service. In the CLI, option 6
creates a signed delegator enrollment; after joining Sentinel, circuit option 4
submits it to this service. Sponsor submission now queries this service during
its stale-delegator preflight.

## Live devnet end-to-end test

With the node, indexer, and proof server already running and the full-ZK
Sentinel and composite-target artifacts built, run:

```sh
pnpm --filter @midnight-sentinel/sponsor-service test:e2e:devnet
```

The command recompiles and copies the full-ZK Sentinel and target artifacts
before starting so generated contract bindings, ZKIR, and proving keys cannot
silently drift out of sync.

This is an opt-in system test and does not use mocked wallets, providers,
registrations, contracts, proofs, or HTTP endpoints. It snapshots the existing
devnet state, creates fresh isolated user wallets, funds them from the known
devnet genesis wallet, submits real sponsor-directed NIGHT registrations,
deploys a target and Sentinel, starts the real eligibility service on an
ephemeral port, and exercises:

- empty-queue fail-closed behavior;
- invalid, expired, wrong-campaign, unregistered, replayed, and below-minimum
  enrollments;
- three real indexer-backed enrollments;
- deterministic `A -> B -> C -> A` rewards;
- both `SucceedEntirely` and `FailFallible`;
- exact sponsor and delegator wallet reward deltas;
- authenticated queue removal and automatic finalized stale-entry removal.

The test leaves submitted devnet transactions and contracts in chain history.
Wallets, the HTTP server, and the temporary SQLite database are closed even
after failure. A sanitized JSON report is retained in the printed temporary
directory; wallet and operator secrets are never included.
