# DUST Sponsorship Purchase: Feasibility and Assumptions

Status: design analysis, not an implementation specification  
Last updated: 2026-07-23

## Purpose

This document records the reasoning behind a proposed `purchaseSponsorship`
Compact circuit for Sentinel. It is intended to give a future engineer enough
context to understand:

- the product idea;
- which behaviors are enforced by Compact, the Midnight ledger, and wallets;
- what is believed to be feasible;
- what is explicitly not possible with current Midnight primitives;
- which assumptions still require practical verification.

The final reward formula and the distribution of sponsorship revenue among
NIGHT contributors are intentionally out of scope. This document does,
however, define the sponsor attribution and revenue accounting needed to make
that later work possible.

## Executive conclusion

A `purchaseSponsorship` circuit is feasible if its guarantee is defined as:

> Accept and record a valid token payment in a transaction whose network fees
> must be covered by valid DUST before the transaction can succeed, and
> attribute that payment to the public sponsor selected in the call.

The contract cannot itself own or spend DUST, identify which DUST address paid
the fee, or prove that the DUST came from a particular NIGHT registration.
A wallet process must hold the DUST secret key and add the fee contribution.

The expected transaction flow is:

```text
Beneficiary
  creates purchaseSponsorship(payment, sponsorId)
  balances shielded/unshielded assets but excludes DUST
                 |
                 v
  finalizes the contract transaction
                 |
                 v
Sponsor service
  validates the finalized transaction, including that
  sponsorId identifies this sponsor
  adds only the required DUST
                 |
                 v
Midnight ledger
  validates payment, contract proof, transaction binding,
  DUST proof, fee coverage, and transaction state
                 |
                 v
  payment + sponsor revenue credit + purchase record
  + fee payment succeed together
```

The sponsor remains trusted for availability: it may reject requests or go
offline. It is not trusted to settle the payment honestly because it cannot
alter the beneficiary's finalized and cryptographically bound transaction.

## Terminology

- **NIGHT** is Midnight's native asset. Unshielded NIGHT UTXOs may be
  registered for DUST generation.
- **DUST** is a shielded, non-transferable network resource used only for
  transaction fees. It is not a normal token.
- **Beneficiary** is the wallet requesting fee sponsorship.
- **Sponsor** is a wallet or service that holds a DUST secret key and adds a
  DUST spend to the beneficiary's transaction.
- **Sponsor ID** is the public identifier supplied to `purchaseSponsorship`.
  It resolves to one sponsor and its associated delegation/revenue pool. It
  need not be private.
- **Sponsor pool** is the accounting domain to which sponsorship payments are
  credited. NIGHT contributors may direct DUST generation toward its sponsor
  and may later become eligible for a share of its revenue.
- **Contributor** is a NIGHT holder who registers NIGHT generation to a
  sponsor's DUST address. The final contributor reward calculation is out of
  scope here.
- **Purchase contract** is the deployed Compact contract containing the
  proposed `purchaseSponsorship` entry point.

## Relevant protocol facts

### NIGHT registration and DUST ownership

DUST registration maps a NIGHT user address to a `DustPublicKey`. It is
authorized by the NIGHT address's signature key. The Wallet SDK supports
specifying a DUST receiver address different from the NIGHT owner's own DUST
address. This enables a NIGHT holder to keep custody of unshielded NIGHT while
directing generated DUST to a sponsor.

Contract-owned unshielded NIGHT cannot currently follow this path. A contract
balance belongs to a `ContractAddress`, while DUST registration requires a
NIGHT user verifying key and corresponding signature. A Compact contract has no
NIGHT secret key with which to authorize registration.

### DUST spending

A DUST spend proves knowledge of a `DustSecretKey`, ownership of a DUST UTXO,
membership of its commitment and backing generation information, and
sufficient effective value for the declared fee. Ownership cannot change
during the spend.

A Compact contract cannot:

- be a DUST address;
- safely store a DUST secret key;
- construct a DUST spend through the Compact standard library;
- initiate and submit a transaction autonomously.

The sponsor must therefore remain a wallet-side process.

### Transaction sponsorship and merging

The Wallet SDK supports preparing and finalizing a transaction without DUST,
then passing it to another wallet which balances only the DUST component.
Midnight transaction merging permits this when the sponsor's balancing
transaction has no competing contract-call section.

The beneficiary's token effects and contract call are cryptographically bound
before the sponsor receives the transaction. The sponsor may append its allowed
balancing contribution but cannot redirect the beneficiary's payment or change
the contract invocation.

### Guaranteed and fallible execution

Fees are handled in the guaranteed phase. A Compact circuit with no
`kernel.checkpoint()` is guaranteed-only. The proposed purchase circuit must
remain guaranteed-only so that:

- an invalid payment rejects the whole transaction;
- an invalid contract proof rejects the whole transaction;
- insufficient or invalid DUST rejects the whole transaction;
- rejection does not commit the payment, purchase record, or DUST spend.

Introducing a fallible section would permit partial success, including DUST
being consumed even when later contract operations fail. That behavior is not
acceptable for the initial purchase protocol.

## Responsibility boundaries

### Beneficiary wallet

The beneficiary wallet is responsible for:

- choosing a sponsor and accepting its commercial terms;
- constructing the call to the correct deployed contract and entry point;
- providing the required payment asset;
- balancing its shielded and/or unshielded assets;
- excluding DUST from its balancing step;
- proving and finalizing its portion of the transaction;
- delivering the finalized transaction to the sponsor before its TTL expires.

### `purchaseSponsorship` circuit

The circuit is expected to validate only contract-observable business rules,
such as:

- accepted payment token or token policy;
- the fixed payment amount, or another configured pricing rule;
- positive payment amount;
- a valid public `sponsorId` resolving to a registered sponsor pool;
- offer activation and expiry, if offers are stored on-chain;
- uniqueness of a purchase or quote identifier, if replay protection is
  required;
- receipt of the payment by the contract;
- crediting the payment to the named sponsor's revenue accounting;
- incrementing the named sponsor's purchase count, if retained;
- creation of any purchase receipt needed for later accounting or audit.

The circuit does not need to inspect DUST. If the transaction lacks sufficient
DUST, the ledger rejects it independently.

### Sponsor service

Before adding DUST, the sponsor should validate:

- network identifier;
- expected contract address;
- expected `purchaseSponsorship` entry point;
- that the public `sponsorId` identifies this sponsor and its pool;
- expected offer or quote identifier;
- payment token, amount, and destination as far as they are inspectable;
- transaction TTL;
- estimated total fee and a configured maximum fee;
- absence of unexpected actions or effects under the sponsor's policy;
- that it will balance only the DUST component.

The sponsor may rely on the ledger to reject an invalid Compact or Zswap proof,
but practical verification must establish that rejection in the guaranteed
phase cannot consume the sponsor's DUST.

### Midnight ledger

The ledger validates:

- ownership and validity of payment inputs;
- contract-call proof and declared effects;
- contract/Zswap and contract/unshielded claim consistency;
- transaction signatures and binding commitments;
- ownership and validity of the sponsor's DUST spend;
- sufficient DUST fee coverage;
- transaction balancing, ordering, and replay protection;
- guaranteed-phase state applicability.

## Operational sponsor attribution

The proposed design does not require the Compact contract to identify the
actual DUST key used in the transaction. Instead, it uses a public sponsor ID
and defensive inspection by the sponsor:

1. The beneficiary names a sponsor in `purchaseSponsorship`.
2. The contract validates the sponsor ID and attributes the fixed payment to
   that sponsor's pool.
3. The named sponsor inspects the finalized transaction.
4. The sponsor supplies DUST only if the transaction names that sponsor and
   satisfies its complete policy.

A different DUST holder can technically fund a transaction that names the
sponsor. Doing so spends the other holder's DUST while crediting the named
sponsor's pool. This is economically equivalent to donating DUST to that pool
and does not let the other holder capture its revenue. Under the rational-actor
assumption, it is not a reason to require an on-chain proof linking
`sponsorId` to the DUST spend.

The accounting meaning is therefore:

> A successful fixed-price sponsorship purchase attributed to a sponsor ID
> and accepted by a DUST-paying actor.

It is not a protocol-level claim that a particular DUST public key supplied
the fee. This distinction should be preserved in names, documentation, and
future reward calculations.

The contract should preferably track both:

```text
sponsorRevenue[sponsorId] += paymentAmount
sponsorPurchases[sponsorId] += 1
```

With a fixed price, the two values are mathematically related. Revenue is still
the more direct basis for later distribution, while the purchase count is
useful for metrics and auditing. Per-purchase receipts or commitments should
also be considered so aggregate accounting can be reconstructed.

## Exact guarantees and non-guarantees

### Intended guarantees

If a transaction is accepted:

- `purchaseSponsorship` executed successfully;
- the contract's payment conditions were satisfied;
- the contract received or otherwise processed the payment as designed;
- the payment was attributed to the public sponsor ID in the call;
- the named sponsor's revenue and purchase accounting were updated as
  designed;
- any required purchase receipt was recorded;
- the ledger verified sufficient valid DUST for all transaction fees;
- the sponsor could not change the beneficiary's committed payment terms.

If guaranteed validation fails:

- the payment is not committed;
- the purchase record is not committed;
- the DUST spend is not committed.

### Explicit non-guarantees

The contract cannot establish:

- that the DUST key associated operationally with the named sponsor paid the
  fee;
- which DUST address paid;
- the exact DUST amount attributed to a particular sponsor;
- which NIGHT UTXO generated that DUST;
- whether a contributor's NIGHT remains registered;
- that a sponsor will accept or remain online for future requests.

The contract also cannot distinguish third-party-sponsored DUST from DUST paid
by the beneficiary itself. This does not invalidate the operational
attribution model: an actor choosing to fund a transaction naming another
sponsor bears the DUST cost while the named pool receives the revenue credit.
It does mean that accounting proves successful attributed purchases, not
cryptographic ownership of the DUST spend.

## Oracle considerations

No oracle is required for the core purchase flow.

An oracle becomes relevant only when the protocol needs to prove facts that
Compact cannot currently read, such as whether a specific unshielded NIGHT UTXO
is still unspent and registered to a sponsor's DUST address.

An open-source oracle implementation is auditable and may be run by many
operators, but openness alone does not make its statements trustworthy. A
contract that accepts an attestation from any arbitrary oracle is vulnerable to
an attacker operating a dishonest oracle. A secure oracle design would require
one of:

- a cryptographic proof tied to canonical Midnight ledger state;
- threshold attestations from an explicitly governed set;
- an optimistic challenge and slashing mechanism;
- an acknowledged trusted oracle.

This decision is deferred with the rewards design.

## Current repository context

The current contract in [`src/sentinel.compact`](src/sentinel.compact) is a
prototype with a different flow:

- `delegate` receives shielded NIGHT into a contract vault;
- the owner later withdraws the shielded NIGHT;
- an external admin wallet sponsors DUST;
- rewards are deposited back into a contract vault.

Shielded NIGHT held by the contract cannot be registered for DUST generation.
The current sponsorship code in
[`../api/src/index.ts`](../api/src/index.ts) already demonstrates adding only
DUST to another wallet's finalized transaction. The CLI examples demonstrate
pure Zswap sponsorship, but not yet sponsorship of a finalized transaction
containing a `purchaseSponsorship` Compact call.

The package currently targets Compact language version `0.23` and uses Wallet
SDK release-candidate packages. Compatibility with the exact installed
versions must be verified rather than inferred solely from current upstream
documentation.

## Assumptions

### Supported by specification and current APIs

1. A beneficiary can construct a contract transaction without balancing DUST.
2. A sponsor can add only DUST to an already-finalized transaction.
3. A sponsor balancing contribution with no contract calls can be merged with
   the beneficiary's transaction containing one contract-call section.
4. Contract token effects and sponsor DUST fees can coexist in one bound
   transaction.
5. A circuit without `kernel.checkpoint()` executes only in the guaranteed
   phase.
6. A contract can receive normal shielded or unshielded payment assets.
7. The ledger rejects a transaction whose DUST contribution is missing,
   invalid, or insufficient.

### Design assumptions

1. The purchase circuit will be guaranteed-only.
2. The contract will already be deployed before purchases begin.
3. Sponsor refusal is allowed; censorship resistance requires multiple
   independent sponsors rather than contract automation.
4. Sponsor identities and their delegation/revenue pools are public.
5. A sponsor supplies DUST only after verifying that the transaction's public
   `sponsorId` identifies that sponsor and that the complete transaction meets
   its policy.
6. Operational sponsor attribution is sufficient; protocol-level proof that
   the named sponsor's DUST key funded the fee is not required.
7. A DUST holder funding a purchase attributed to somebody else is treated as
   a voluntary donation of the sponsorship cost to the named pool.
8. The final contributor eligibility and proportional reward formula remain
   out of scope.
9. Pricing may initially be fixed or stored on-chain. Compact has no built-in
   general signature-verification function, so authenticated dynamic off-chain
   quotes require a separate design.
10. The initial implementation may disclose payment token and amount where
   required by Compact token operations and ledger effects.

### Unverified implementation assumptions

1. The installed Wallet SDK can finalize a contract transaction without DUST
   and subsequently sponsor it using `tokenKindsToBalance: ['dust']`.
2. The sponsor can reliably inspect or identify the intended contract address,
   entry point, payment effects, and TTL before adding DUST.
3. Guaranteed-phase failure of the sponsored contract call leaves the
   sponsor's DUST unconsumed in the exact installed node/ledger version.
4. Receiving and recording payment does not introduce unacceptable shared-state
   contention under concurrent purchase requests.
5. Proof generation and the two-party handoff complete within a safe TTL.
6. Fee estimation provides a usable upper bound for sponsor policy.
7. The chosen shielded or unshielded payment path is supported end to end by
   the current provider stack.

## Practical verification backlog

These checks should be planned and executed independently.

| ID | Verification | Success criterion |
|---|---|---|
| PV-01 | Build a minimal guaranteed-only purchase circuit | Contract compiles without a checkpoint or fallible transcript |
| PV-02 | User prepares the purchase without DUST | User can prove/finalize while balancing only payment assets |
| PV-03 | Sponsor adds DUST to the finalized contract transaction | Sponsor balances only DUST and submits successfully |
| PV-04 | Successful atomic settlement | Payment, receipt, and fee payment appear in one successful transaction |
| PV-05 | Missing DUST failure | Transaction is rejected and payment/receipt are not committed |
| PV-06 | Invalid payment failure | Transaction is rejected and sponsor DUST is not consumed |
| PV-07 | Stale contract state failure | Guaranteed state conflict rejects without consuming payment or DUST |
| PV-08 | Sponsor transaction inspection | Sponsor can enforce contract, entry point, TTL, and fee-limit policy |
| PV-09 | Tampering resistance | Sponsor cannot alter payment token, amount, recipient, or call |
| PV-10 | Excessive-fee defense | Sponsor refuses requests above a configured maximum |
| PV-11 | TTL behavior | Expired handoffs fail safely without committed effects |
| PV-12 | Concurrent purchases | Independent purchases do not cause unacceptable conflicts or lost throughput |
| PV-13 | Privacy inspection | Document exactly which payment, offer, and receipt fields are public |
| PV-14 | SDK/version compatibility | Results are reproduced with the versions pinned by this repository |
| PV-15 | Sponsor-ID inspection | Sponsor can verify the finalized call names its registered public ID before adding DUST |
| PV-16 | Per-sponsor attribution | Successful purchase credits only the pool selected by `sponsorId` |
| PV-17 | Attribution rejection | Sponsor refuses a valid purchase that names a different sponsor |
| PV-18 | Revenue reconstruction | Aggregate sponsor revenue and purchase count agree with recorded purchase receipts |

## Deferred design decisions

The following choices are deliberately not settled by this feasibility note:

- shielded versus unshielded payment;
- fixed price, on-chain offers, or authenticated off-chain quotes;
- exact versus minimum payment;
- contract treasury versus immediate forwarding to a recipient;
- public versus privacy-preserving purchase receipts;
- single sponsor versus permissionless sponsor registry;
- contributor locking, eligibility snapshots, and proportional reward
  calculation;
- treatment of sponsor self-purchases in the eventual reward formula;
- counter, receipt, or accumulator structures for concurrent accounting;
- oracle, threshold, or challenge mechanism for NIGHT registration proofs.

These decisions should be made only after PV-01 through PV-09 establish the
core sponsored contract-call flow.

## Primary references

- [Midnight ledger DUST and fee-payment specification](https://github.com/midnightntwrk/midnight-ledger/blob/ledger-8/spec/dust.md)
- [Midnight Wallet SDK: DUST sponsorship](https://docs.midnight.network/sdks/official/wallet-developer-guide#dust-sponsorship)
- [Midnight transaction building blocks and merging](https://docs.midnight.network/concepts/how-midnight-works/building-blocks#merging)
- [Midnight Indexer `UnshieldedUtxo`](https://docs.midnight.network/api-reference/midnight-indexer/types/objects/unshielded-utxo)
- [Midnight ledger transaction and intent specification](https://github.com/midnightntwrk/midnight-ledger/blob/ledger-8/spec/intents-transactions.md)
