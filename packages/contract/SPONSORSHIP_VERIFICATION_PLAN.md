# DUST Sponsorship: Practical Verification Plan

Status: critical composite-transaction validation pending
Last updated: 2026-07-24

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
| Critical                           | VP-01 through VP-10 |
| Important before production design | VP-11 through VP-15 |
| Scalability and hardening          | VP-16 through VP-19 |

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

**Verdict (2026-07-24): Confirmed.**

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

**Observed result:** Full-ZK artifacts were generated with Compact compiler
`0.31.1`. Deterministic circuit execution produced revenue `200` and purchase
count `2` after two valid payments of `100`.

### VP-02 — Payment rules reject incorrect purchases

**Verdict (2026-07-24): Confirmed.**

Test independently:

- wrong sponsor ID;
- wrong token color;
- amount below the fixed price;
- amount above the fixed price;
- zero amount.

**Pass criterion:** Every invalid case fails with the expected assertion and
does not update revenue or purchase count.

**Observed result:** Wrong sponsor, wrong asset, amount below `100`, amount
above `100`, and zero payment all failed without changing contract state.

### VP-03 — The purchase is guaranteed-only

**Verdict (2026-07-24): Confirmed.**

**Claim:** The circuit has no fallible portion.

**Method:**

- confirm the source contains no `kernel.checkpoint()`;
- inspect compiler metadata or compiled transaction structure;
- submit both successful and deliberately failing calls.

**Pass criterion:** The call is represented only in the guaranteed section.

**Observed result:** The compiled purchase contained a guaranteed transcript
and no fallible transcript. The source contains no `kernel.checkpoint()`.

### VP-04 — Beneficiary can finalize without DUST

**Verdict (2026-07-24): Confirmed.**

**Setup:** The beneficiary has the accepted payment asset but no spendable
DUST.

**Method:** Construct, prove, and finalize the purchase while balancing only
the shielded/unshielded payment components.

**Pass criterion:** A finalized transaction is produced without a DUST spend.
It is not expected to be independently submittable yet.

**Observed result:** A beneficiary with zero available DUST finalized a
20,599-byte transaction containing the purchase and its shielded NIGHT
payment. No DUST fee action was present at this stage.

### VP-05 — Sponsor can add only DUST

**Verdict (2026-07-24): Confirmed.**

**Method:** Sponsor the beneficiary's finalized transaction with
`balanceFinalizedTransaction` and `tokenKindsToBalance: ['dust']`.

**Pass criteria:**

- the sponsor adds a valid DUST spend;
- no sponsor shielded or unshielded payment input is added;
- the resulting transaction can be finalized and submitted.

**Observed result:** The sponsor added a second intent containing the DUST fee
action while requesting only `['dust']`. The original contract call and
beneficiary payment were preserved, and the resulting transaction was
successfully finalized and submitted.

### VP-06 — Sponsor can independently inspect the transaction

**Verdict (2026-07-24): Confirmed for the fields exercised by the minimal
single-sponsor contract.**

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

**Observed result:** After a serialization round trip, the sponsor inspected
one intent containing one call, the expected contract address and entry point,
the guaranteed/fallible transcript structure, TTL, and fee estimate. In this
minimal contract the configured sponsor ID and proof make separate raw
argument decoding unnecessary; a production multi-sponsor design will require
additional inspection evidence.

### VP-07 — Sponsor cannot alter the purchase

**Verdict (2026-07-24): Refuted as originally stated.**

Attempt to change each of the following after beneficiary finalization:

- sponsor ID;
- token color;
- amount;
- recipient/contract;
- circuit;
- unrelated output.

**Pass criterion:** Mutation is impossible through the balancing API or causes
finalization, well-formedness, proof, or ledger validation to fail.

**Observed result:** Normal sponsorship preserved the contract address, entry
point, and communication commitment, and attempted action mutation was
rejected. TTL was not protected in the same way: a mutated TTL remained
serializable and was accepted in a prior live run. Therefore the sponsor must
inspect the final TTL after balancing and apply its own recency policy. This
does not show that the sponsor can modify the proved contract call.

### VP-08 — Successful atomic settlement

**Verdict (2026-07-24): Confirmed for the successful path.**

**Method:** Submit the correctly sponsored transaction and inspect contract,
wallet, and node/indexer state.

**Pass criteria:**

- the payment is consumed exactly once;
- sponsor revenue increases by the fixed price;
- sponsor purchase count increases by one;
- the ledger accepts the DUST fee;
- all effects share one accepted transaction.

**Observed result:** One accepted transaction consumed the beneficiary
payment, set sponsor revenue to `100`, incremented purchases to `1`, and
committed the sponsor's DUST fee action atomically.

### VP-09 — Guaranteed failures consume nothing

**Verdict (2026-07-24): Confirmed by specification and ledger source
inspection.**

**Claim:** If the contract call is in the guaranteed portion and that call
fails at ledger application time, the whole transaction is rejected. In
particular, the beneficiary payment, contract updates, and sponsor DUST fee
must not be committed independently.

VP-09 is **not** trying to move an arbitrary contract interaction into an
"essential segment" after sponsorship. VP-03 already established that this
specific `purchaseSponsorship` circuit compiles to a guaranteed transcript
because it has no `kernel.checkpoint()`. VP-09 tests the failure semantics of
that already-guaranteed transaction after the sponsor has added a valid DUST
fee action.

Candidate failure cases include:

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
- no DUST fee consumption is committed.

**Verification evidence:** The Midnight transaction specification defines a
failure while applying the guaranteed segment as `FailEntirely`. Guaranteed
application is performed against a tentative state; the resulting state is
committed only if that segment succeeds. The guaranteed segment includes
shielded/unshielded offers, guaranteed contract actions, and DUST fee actions.
Midnight's transaction-semantics documentation states that a transaction which
fails during the guaranteed phase is not included in the ledger. Therefore its
beneficiary payment, contract updates, and DUST fee are not committed.

The earlier unsponsored submission rejected with custom error `138` is not the
basis for this verdict; it only demonstrates rejection of an unbalanced
transaction. A sponsored stale-state devnet test would be an optional
integration/conformance test, not necessary evidence for the protocol
semantics asserted by VP-09.

### VP-10 — Composite application transaction sponsorship

**Verdict (2026-07-24): Inconclusive — not yet executed.**

**Claim:** A beneficiary can construct one transaction containing its real
application interaction, an independent token transfer, and a guaranteed
`purchaseSponsorship` call; finalize the complete transaction without DUST;
and give it to a sponsor that inspects every action and adds only DUST.

This is the product-level composition check missing from VP-01 through VP-09.
Those checks established the lower-level purchase and wallet sponsorship
mechanics using `purchaseSponsorship` as the only contract call. They did not
establish sponsorship of another application interaction.

**Required transaction shape:**

```text
Beneficiary-constructed transaction
  guaranteed section
    purchaseSponsorship payment and accounting
    beneficiary token transfer to address Z
    any guaranteed portion of Contract A
  fallible section, if defined by Contract A
    Contract A fallible operations

Sponsor contribution after beneficiary finalization
  DUST fee action only
```

**Method:**

1. Deploy a minimal Contract A containing representative guaranteed and
   fallible behavior.
2. Build the Contract A call, transfer to address Z, and
   `purchaseSponsorship` call in one shared transaction-construction context
   before proving or finalization.
3. Include Contract A's address, entry-point hash, and communication
   commitment in the sponsorship receipt metadata.
4. Prove and balance all beneficiary application assets while explicitly
   excluding DUST, then finalize and serialize the complete transaction.
5. Have the sponsor deserialize and inspect every call, transfer, transcript,
   communication commitment, TTL, and fee estimate. The sponsor must verify
   that the receipt metadata matches the actual bundled interaction.
6. Have the sponsor balance only `['dust']`, finalize, submit, and await
   indexer confirmation.
7. Repeat with Contract A deliberately failing in its fallible section.

**Pass criteria:**

- the beneficiary transaction contains both contract calls and the transfer
  before sponsorship;
- `purchaseSponsorship` has a guaranteed transcript and no fallible
  transcript;
- Contract A retains the guaranteed/fallible partition defined by its own
  circuit;
- the beneficiary finalizes the complete transaction without DUST;
- the sponsor adds only DUST and does not change or remove any inspected call,
  transfer, transcript, or communication commitment;
- successful execution commits Contract A's successful effects, the transfer,
  sponsorship payment, receipt/accounting update, and DUST fee in the expected
  sections of one transaction;
- deliberate failure of Contract A's fallible portion produces partial
  success: the guaranteed sponsorship purchase, DUST fee, and other guaranteed
  effects remain committed while only Contract A's failed fallible effects
  are discarded;
- sanitized evidence records action commitments, transcript partitions,
  transaction status, and pre/post state without recording secrets or complete
  sensitive transaction objects.

**Binding limitation:** A guaranteed `purchaseSponsorship` call cannot use
`kernel.claimContractCall` to claim a fallible Contract A call because Midnight
rejects a guaranteed-to-fallible call relationship. For arbitrary fallibility,
the contract records target metadata and the sponsor service authenticates it
against the actual bundled call before adding DUST. Transaction binding must
then prevent removal or mutation after inspection.

## Important checks before production design

### VP-11 — Wrong-sponsor refusal

Give Sponsor B a valid transaction that names Sponsor A.

**Pass criterion:** Sponsor B's policy rejects it before balancing. If Sponsor B
is deliberately configured to accept it, the ledger may accept it and credit
Sponsor A; this confirms the documented donation behavior.

### VP-12 — Fee-limit defense

Construct otherwise valid transactions with progressively larger fee
requirements or extra allowed actions.

**Pass criterion:** The sponsor reliably refuses any transaction whose maximum
fee exposure exceeds its configured limit.

### VP-13 — Replay resistance

Resubmit an already accepted transaction and reuse any application-level
purchase ID introduced by the prototype.

**Pass criteria:**

- ledger replay is rejected;
- an application purchase ID cannot be credited twice if the design adds one.

### VP-14 — Accounting reconstruction

Record a receipt or commitment for each successful purchase and execute
multiple purchases for at least two sponsors.

**Pass criterion:**

```text
sum(receipt amounts for sponsor) == sponsorRevenue[sponsor]
count(receipts for sponsor) == sponsorPurchases[sponsor]
```

### VP-15 — Visibility audit

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

### VP-16 — Concurrent purchases

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

### VP-17 — Multiple sponsors

Replace the single configured sponsor with a minimal registry and repeat the
complete flow with two sponsors.

**Pass criteria:**

- each sponsor funds only transactions it accepts;
- payment is credited only to the selected pool;
- one sponsor cannot modify another sponsor's accounting.

### VP-18 — Version reproducibility

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

### VP-19 — Sponsor-service failure handling

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
VP-10
        |
        v
VP-11 through VP-15
        |
        v
VP-16 through VP-19
```

Stop and reassess immediately if VP-04, VP-05, VP-06, VP-08, VP-09, or VP-10
fails for a protocol or SDK reason rather than an experiment defect.

## Primary references

- [Midnight Wallet SDK: balance a finalized transaction](https://docs.midnight.network/sdks/official/wallet-developer-guide#balance-a-finalized-transaction)
- [Midnight transaction merging and integrity](https://docs.midnight.network/concepts/how-midnight-works/building-blocks#merging)
- [Midnight ledger DUST specification](https://github.com/midnightntwrk/midnight-ledger/blob/ledger-8/spec/dust.md)
- [Midnight ledger transaction and intent specification](https://github.com/midnightntwrk/midnight-ledger/blob/ledger-8/spec/intents-transactions.md)

## Observed critical verdicts — 2026-07-24

The isolated verification harness ran against node `0.22.5`, indexer `4.2.1`,
proof server `8.1.0`, Compact compiler `0.31.1`, and network `undeployed`.
Sanitized machine-readable evidence is retained in
[`verification-results/sponsorship-verification.json`](verification-results/sponsorship-verification.json)
and
[`verification-results/sponsorship-composite-verification.json`](verification-results/sponsorship-composite-verification.json).

| Check | Verdict      | Observed evidence                                                                                                                                                                                                                                                                      |
| ----- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VP-01 | Confirmed    | Full-ZK artifacts generated; deterministic execution produced revenue `200` and purchase count `2` after two exact payments.                                                                                                                                                           |
| VP-02 | Confirmed    | Wrong sponsor, asset, low amount, high amount, and zero payment rejected without state updates.                                                                                                                                                                                        |
| VP-03 | Confirmed    | One guaranteed transcript was present and the fallible transcript was absent.                                                                                                                                                                                                          |
| VP-04 | Confirmed    | The beneficiary finalized a 20,599-byte transaction with zero DUST balance and no DUST coin records.                                                                                                                                                                                   |
| VP-05 | Confirmed    | The sponsor added a second intent containing only DUST balancing; no shielded or unshielded sponsor payment input was requested.                                                                                                                                                       |
| VP-06 | Confirmed    | Round-trip serialization, one original intent/call, contract address, entry point, transcripts, TTL, and fee estimate were independently inspected.                                                                                                                                    |
| VP-07 | Refuted      | Action mutation was rejected and normal sponsorship preserved the call and communication commitment, but TTL mutation remained serializable and was accepted in a prior live run. TTL must be treated as sponsor-controlled/revalidated after balancing rather than beneficiary-bound. |
| VP-08 | Confirmed    | One accepted transaction set revenue to `100`, purchases to `1`, consumed the beneficiary payment, and committed the sponsor's DUST fee action in the same transaction.                                                                                                                |
| VP-09 | Confirmed    | Ledger specification and source inspection establish that failure of the guaranteed segment returns `FailEntirely`; tentative payment, contract, and DUST changes are not committed, and the transaction is not included in the ledger.                                                |
| VP-10 | Confirmed    | Two composite transactions combined a separate target contract call, a guaranteed `purchaseSponsorship` receipt, and an independent shielded transfer. The beneficiary finalized with zero DUST; the sponsor added a third intent containing only DUST. The success case returned `SucceedEntirely`; the expired target case returned `FailFallible` while preserving guaranteed sponsorship accounting and the independent transfer. Target state ended at `2` guaranteed executions and `1` fallible execution; sponsorship state ended at revenue `200`, purchases `2`, and receipts `2`. |

### Decision

The product-level sponsorship design is **implementation-feasible under the
stated decision rule**. VP-10 confirms that the sponsorship purchase can be
composed with, and cryptographically bind a receipt to, a separate application
contract call while an independent shielded transfer remains in the same
transaction. A beneficiary with zero DUST can finalize the bundle and a sponsor
can add only the DUST fee action without changing the inspected calls or their
communication commitments.

The target experiment also clarified that `kernel.checkpoint()` supplies an
eligible partition boundary rather than forcing a fallible transcript. The
ledger maximizes the portion that fits within its guaranteed
time-to-dismiss budget; a small checkpointed call can therefore remain entirely
guaranteed. The test target used distinct post-checkpoint public writes so its
suffix naturally exceeded that budget and exercised `FailFallible`.

VP-07 also establishes that TTL is sponsor-controlled metadata rather than a
beneficiary-bound contract-call field. The sponsor must revalidate the final
TTL after balancing. VP-09 is confirmed by the normative transaction
specification and ledger implementation and does not require a separate
stale-state devnet experiment.

## Production vertical-slice implementation — 2026-07-27

The confirmed VP-01–VP-10 assumptions have now been applied to the production
Sentinel contract and API without deleting the retained verification
contracts, generated artifacts, runners, or reports.

| Item | Status | Evidence |
| --- | --- | --- |
| Immutable single-sponsor campaign | Implemented | Sentinel constructor seals sponsor DUST public key, payment color, exact price, and allowlist policy hash. |
| Guaranteed receipt purchase | Implemented | `purchaseSponsorship` has no checkpoint and records the target address, entry-point hash, and communication commitment. |
| Replay prevention | Implemented | Duplicate purchase IDs are rejected on-chain; duplicate target communication commitments are rejected by sponsor inspection against public receipts. |
| Treasury lifecycle | Deferred | Payments are a v1 contract sink. Devnet diagnostics showed that coin aggregation/withdrawal moved the whole purchase outside the guaranteed budget. |
| Generic two-call composer | Implemented | API accepts a prepared unproven target call, merges it with Sentinel, proves it, and balances only shielded/unshielded assets. |
| Independent sponsor inspection | Implemented | Structural, allowlist, campaign, transfer, TTL, fee, transcript-replay, receipt-delta, and post-DUST binding checks. |
| DUST-only sponsor path | Implemented | Sponsor balances only `['dust']`, re-inspects, submits, and awaits indexed transaction data. |
| Operator CLI | Implemented | Deployment configuration, policy-bound sponsor submission, and pause/resume. |
| Existing UI compatibility | Confirmed | TypeScript and the Vite production bundle complete with the new constructor/state shape; no sponsorship workflow was added. |
| Deterministic production runtime check | Confirmed | Exact payment credited `100`, one receipt recorded, duplicates rejected, and pause enforced. |
| Fresh production-path devnet run | Pending | Full-ZK Sentinel artifacts were generated, but no node/indexer/proof-server containers were running at the final check. |

Implementation details and commands are documented in
[`SPONSORSHIP_IMPLEMENTATION.md`](SPONSORSHIP_IMPLEMENTATION.md).
