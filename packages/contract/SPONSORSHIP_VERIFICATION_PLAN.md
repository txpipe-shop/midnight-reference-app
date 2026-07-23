# DUST Sponsorship: Practical Verification Plan

Status: proposed experiments, not implementation evidence  
Last updated: 2026-07-23

## Goal

Prove or refute the following narrow claim using the versions installed in
this repository:

> A user can create a guaranteed-only Compact call that pays a fixed shielded
> asset and publicly names a sponsor; the named sponsor can independently
> inspect the finalized transaction, add only DUST, and submit it so the
> payment, sponsor attribution, and DUST fee settle atomically.

This plan does not attempt to prove the contributor reward formula, continued
NIGHT registration, production treasury design, or permissionless sponsor
discovery. Those are later layers.

The design context and protocol assumptions are recorded in
[`SPONSORSHIP_FEASIBILITY.md`](SPONSORSHIP_FEASIBILITY.md).

## Decision rule

The core design is **implementation-feasible** only if all critical checks
below pass.

| Priority                           | Checks              |
| ---------------------------------- | ------------------- |
| Critical                           | VP-01 through VP-09 |
| Important before production design | VP-10 through VP-14 |
| Scalability and hardening          | VP-15 through VP-18 |

A failed critical check must be classified as one of:

- **Experiment defect**: the test or integration is incorrect; repair and
  repeat it.
- **SDK limitation with workaround**: the design remains possible but the
  transaction workflow must change.
- **Design blocker**: the sponsor cannot safely validate or fund the purchase
  under the current protocol and SDK.

Compilation success alone is not evidence that the end-to-end claim works.
The critical result must come from submitting transactions to a local Midnight
network and inspecting the resulting ledger state.

## Minimal experiment

### Deliberate simplifications

The first experiment should use:

- one deployed contract;
- one preconfigured public `sponsorId`;
- one accepted shielded token color;
- one exact fixed price;
- one beneficiary wallet with the payment asset and no usable DUST;
- one sponsor wallet with DUST;
- a guaranteed-only circuit with no `kernel.checkpoint()`;
- public sponsor identity, payment color, and payment amount;
- a test-only payment sink.

The payment sink is intentional: the first experiment only needs to prove that
the contract receives the payment effect and updates attribution. A production
version must retain a qualified coin reference or forward the payment so the
asset is recoverable.

### Candidate minimal Compact contract

This is a compiling starting point for Compact `0.23`. On 2026-07-23 it
compiled successfully with:

```text
compact compile +0.31.1 --skip-zk sponsorship-min.compact sponsorship-min-out
```

That result establishes syntax and type validity only. The circuit has not yet
been executed in the Compact runtime, proved with ZK enabled, or exercised on a
Midnight network.

```compact
pragma language_version 0.23;

import CompactStandardLibrary;

export ledger configuredSponsor: Bytes<32>;
export ledger acceptedColor: Bytes<32>;
export ledger fixedPrice: Uint<64>;
export ledger sponsorRevenue: Map<Bytes<32>, Uint<128>>;
export ledger sponsorPurchases: Map<Bytes<32>, Uint<64>>;

constructor(
  sponsorId: Bytes<32>,
  paymentColor: Bytes<32>,
  price: Uint<64>
) {
  assert(price > 0, "Price must be positive");
  configuredSponsor = disclose(sponsorId);
  acceptedColor = disclose(paymentColor);
  fixedPrice = disclose(price);
}

export circuit purchaseSponsorship(
  sponsorId: Bytes<32>,
  payment: ShieldedCoinInfo
): [] {
  const publicSponsor = disclose(sponsorId);
  const publicPayment = disclose(payment);

  assert(publicSponsor == configuredSponsor, "Unknown sponsor");
  assert(publicPayment.color == acceptedColor, "Wrong payment asset");
  assert(publicPayment.value == fixedPrice, "Wrong payment amount");

  receiveShielded(publicPayment);

  const paid = publicPayment.value as Uint<128>;

  if (sponsorRevenue.member(publicSponsor)) {
    const previousRevenue = sponsorRevenue.lookup(publicSponsor);
    sponsorRevenue.insert(
      publicSponsor,
      (previousRevenue + paid) as Uint<128>
    );

    const previousPurchases = sponsorPurchases.lookup(publicSponsor);
    sponsorPurchases.insert(
      publicSponsor,
      (previousPurchases + 1) as Uint<64>
    );
  } else {
    sponsorRevenue.insert(publicSponsor, paid);
    sponsorPurchases.insert(publicSponsor, 1);
  }
}
```

Before using it as end-to-end evidence:

1. Reproduce compilation with the repository's pinned Compact compiler.
2. Execute its generated circuit in a deterministic local test.
3. Confirm it contains no fallible transcript or checkpoint.
4. Replace the payment sink in any production prototype.

### Candidate end-to-end flow

Exact API names must be confirmed against the pinned Wallet SDK. The intended
sequence is:

```text
1. Beneficiary builds purchaseSponsorship(SPONSOR_A, paymentCoin).
2. Beneficiary balances shielded/unshielded assets but excludes DUST.
3. Beneficiary proves and finalizes its transaction.
4. Sponsor A deserializes and independently inspects that transaction.
5. Sponsor A verifies:
     contract == expected contract
     circuit == purchaseSponsorship
     sponsorId == SPONSOR_A
     payment color == ACCEPTED_COLOR
     payment amount == FIXED_PRICE
     TTL is acceptable
     estimated fee <= sponsor policy maximum
     no unwanted transaction actions are present
6. Sponsor A calls balanceFinalizedTransaction with only ['dust'].
7. Sponsor A finalizes and submits.
8. The test reads contract state and transaction status.
```

Expected successful state:

```text
sponsorRevenue[SPONSOR_A] == FIXED_PRICE
sponsorPurchases[SPONSOR_A] == 1
transaction status == accepted
sponsor DUST decreased by the charged fee
```

## Critical verification checks

### VP-01 — Minimal contract compiles and executes

**Claim:** The candidate state and circuit operations are valid in Compact
`0.23`.

**Method:**

1. Compile with `pnpm compact:no-zk` or an isolated equivalent.
2. Invoke the generated circuit using a deterministic runtime/simulator test.
3. Inspect the resulting ledger state.

**Pass criteria:**

- compilation succeeds;
- exact payment increments revenue and count;
- the test reads the expected public ledger values.

### VP-02 — Payment rules reject incorrect purchases

Test independently:

- wrong sponsor ID;
- wrong token color;
- amount below the fixed price;
- amount above the fixed price;
- zero amount.

**Pass criterion:** Every invalid case fails with the expected assertion and
does not update revenue or purchase count.

### VP-03 — The purchase is guaranteed-only

**Claim:** The circuit has no fallible portion.

**Method:**

- confirm the source contains no `kernel.checkpoint()`;
- inspect compiler metadata or compiled transaction structure;
- submit both successful and deliberately failing calls.

**Pass criterion:** The call is represented only in the guaranteed section.

### VP-04 — Beneficiary can finalize without DUST

**Setup:** The beneficiary has the accepted payment asset but no spendable
DUST.

**Method:** Construct, prove, and finalize the purchase while balancing only
the shielded/unshielded payment components.

**Pass criterion:** A finalized transaction is produced without a DUST spend.
It is not expected to be independently submittable yet.

### VP-05 — Sponsor can add only DUST

**Method:** Sponsor the beneficiary's finalized transaction with
`balanceFinalizedTransaction` and `tokenKindsToBalance: ['dust']`.

**Pass criteria:**

- the sponsor adds a valid DUST spend;
- no sponsor shielded or unshielded payment input is added;
- the resulting transaction can be finalized and submitted.

### VP-06 — Sponsor can independently inspect the transaction

This is the highest-risk practical check.

The sponsor must derive from the serialized, bound transaction—not from
untrusted request metadata:

- network ID;
- deployed contract address;
- circuit/call identity;
- public `sponsorId`;
- payment token color;
- payment amount;
- payment destination or contract claim;
- TTL;
- fee estimate or safe upper bound;
- all additional actions included in the transaction.

**Pass criterion:** Sponsor policy can make an allow/deny decision using only
authenticated transaction contents plus local configuration.

**Failure consequence:** If these fields cannot be inspected, design a bound
quote or transaction-commitment protocol before proceeding. The sponsor must
not trust a JSON description supplied beside an opaque transaction.

### VP-07 — Sponsor cannot alter the purchase

Attempt to change each of the following after beneficiary finalization:

- sponsor ID;
- token color;
- amount;
- recipient/contract;
- circuit;
- unrelated output.

**Pass criterion:** Mutation is impossible through the balancing API or causes
finalization, well-formedness, proof, or ledger validation to fail.

### VP-08 — Successful atomic settlement

**Method:** Submit the correctly sponsored transaction and inspect contract,
wallet, and node/indexer state.

**Pass criteria:**

- the payment is consumed exactly once;
- sponsor revenue increases by the fixed price;
- sponsor purchase count increases by one;
- the ledger accepts the DUST fee;
- all effects share one accepted transaction.

### VP-09 — Guaranteed failures consume nothing

Submit separate transactions containing:

- an invalid payment;
- an invalid sponsor ID;
- insufficient DUST;
- an invalid DUST proof, if constructible;
- stale contract state;
- an expired TTL.

**Pass criteria for every case:**

- transaction fails entirely;
- payment remains spendable;
- sponsor revenue and count remain unchanged;
- sponsor DUST is not committed as spent.

## Important checks before production design

### VP-10 — Wrong-sponsor refusal

Give Sponsor B a valid transaction that names Sponsor A.

**Pass criterion:** Sponsor B's policy rejects it before balancing. If Sponsor B
is deliberately configured to accept it, the ledger may accept it and credit
Sponsor A; this confirms the documented donation behavior.

### VP-11 — Fee-limit defense

Construct otherwise valid transactions with progressively larger fee
requirements or extra allowed actions.

**Pass criterion:** The sponsor reliably refuses any transaction whose maximum
fee exposure exceeds its configured limit.

### VP-12 — Replay resistance

Resubmit an already accepted transaction and reuse any application-level
purchase ID introduced by the prototype.

**Pass criteria:**

- ledger replay is rejected;
- an application purchase ID cannot be credited twice if the design adds one.

### VP-13 — Accounting reconstruction

Record a receipt or commitment for each successful purchase and execute
multiple purchases for at least two sponsors.

**Pass criterion:**

```text
sum(receipt amounts for sponsor) == sponsorRevenue[sponsor]
count(receipts for sponsor) == sponsorPurchases[sponsor]
```

### VP-14 — Visibility audit

Inspect node, indexer, wallet history, contract state, and serialized
transaction representations.

**Pass criterion:** Document exactly which of these are public:

- sponsor ID;
- payment color;
- payment amount;
- beneficiary identity/address;
- purchase receipt;
- sponsor revenue and purchase count;
- actual DUST payer or DUST amount.

No privacy guarantee should be inferred from a field merely being difficult to
find in one SDK representation.

## Scalability and hardening checks

### VP-15 — Concurrent purchases

Prepare multiple purchases against the same contract state and sponsor, then
prove and submit them concurrently.

Measure:

- stale-state rejection rate;
- successful transactions per block;
- proof regeneration requirements;
- sponsor wallet DUST UTXO conflicts.

**Pass criterion:** Throughput is adequate for the initial target. Otherwise,
evaluate append-only receipts, partitioned sponsor state, batching, serialized
queues, or multiple sponsor wallets.

### VP-16 — Multiple sponsors

Replace the single configured sponsor with a minimal registry and repeat the
complete flow with two sponsors.

**Pass criteria:**

- each sponsor funds only transactions it accepts;
- payment is credited only to the selected pool;
- one sponsor cannot modify another sponsor's accounting.

### VP-17 — Version reproducibility

Run the verification from a clean checkout using the exact versions pinned in
the repository.

Record:

- Compact compiler version;
- Wallet SDK versions;
- Midnight.js versions;
- ledger version;
- node, indexer, and proof-server versions;
- network configuration.

**Pass criterion:** Another developer can reproduce the same results without
unpinned dependencies or undocumented local changes.

### VP-18 — Sponsor-service failure handling

Test:

- wallet not synchronized;
- exhausted or unavailable DUST;
- proof-server failure;
- indexer lag;
- node rejection;
- sponsor crash before and after finalization;
- duplicate client requests.

**Pass criterion:** Failures do not produce false success responses, duplicate
credits, or ambiguous retry behavior.

## Evidence to retain

For every check, save:

- claim being tested;
- exact source revision;
- dependency and service versions;
- test source;
- commands used;
- stdout/stderr;
- serialized transaction before sponsorship;
- serialized transaction after sponsorship;
- transaction hash and status;
- relevant pre-state and post-state;
- conclusion: confirmed, refuted, or inconclusive.

Use observed execution as evidence. Documentation and source inspection explain
expected behavior but do not replace the end-to-end result.

## Recommended execution order

```text
VP-01, VP-02, VP-03
        |
        v
VP-04, VP-05
        |
        v
VP-06, VP-07
        |
        v
VP-08, VP-09
        |
        v
VP-10 through VP-14
        |
        v
VP-15 through VP-18
```

Stop and reassess immediately if VP-04, VP-05, VP-06, VP-08, or VP-09 fails
for a protocol or SDK reason rather than an experiment defect.

## Primary references

- [Midnight Wallet SDK: balance a finalized transaction](https://docs.midnight.network/sdks/official/wallet-developer-guide#balance-a-finalized-transaction)
- [Midnight transaction merging and integrity](https://docs.midnight.network/concepts/how-midnight-works/building-blocks#merging)
- [Midnight ledger DUST specification](https://github.com/midnightntwrk/midnight-ledger/blob/ledger-8/spec/dust.md)
- [Midnight ledger transaction and intent specification](https://github.com/midnightntwrk/midnight-ledger/blob/ledger-8/spec/intents-transactions.md)
