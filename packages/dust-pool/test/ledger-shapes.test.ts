// Transaction shapes of the pool, applied to the real ledger 9 implementation
// in process. Balancing, signatures, binding commitments and DUST bookkeeping
// are enforced; ZK proofs are not verified (see test/support/chain.ts).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import * as L from '@midnightntwrk/ledger-v9';
import { openingOf, publishedNoteOf, SPECKS_PER_DUST, STARS_PER_NIGHT } from '../src/notes.js';
import {
  Chain,
  DustWallet,
  newAccount,
  nightTo,
  signIntent,
  spendOf,
  txOf,
  type Account,
  type BoundTx,
  type OpenTx,
} from './support/chain.js';

const DAY = 86_400;

/** A delegator registers a NIGHT UTXO to someone else's DUST key, paying the fee from backdated DUST. */
const registerTo = (
  chain: Chain,
  delegator: Account,
  utxo: L.Utxo,
  dustKey: L.DustPublicKey,
  allowFeePayment: bigint
): BoundTx => {
  const intent = L.Intent.new(chain.ttl());
  intent.guaranteedUnshieldedOffer = L.UnshieldedOffer.new(
    [spendOf(utxo, delegator)],
    [nightTo(delegator.address, utxo.value)],
    []
  );
  intent.dustActions = new L.DustActions(
    'signature',
    'pre-proof',
    chain.date,
    [],
    [new L.DustRegistration('signature', delegator.verifyingKey, dustKey, allowFeePayment)]
  );
  return txOf([[1, signIntent(intent, 1, delegator)]]).bind();
};

const feeOf = (chain: Chain, tx: L.Transaction<L.Signaturish, L.Proofish, L.Bindingish>) =>
  tx.fees(chain.params);

test('a delegator with no DUST joins the pool in one self-funded transaction', () => {
  const chain = new Chain();
  const delegator = newAccount();
  const pool = new DustWallet(chain, randomBytes(32));

  const night = 1_000n * STARS_PER_NIGHT;
  const utxo = chain.fund(delegator, night);
  chain.advance(2 * DAY); // the NIGHT sits unregistered and accrues backdated DUST

  const allow = 1n * SPECKS_PER_DUST;
  const tx = registerTo(chain, delegator, utxo, pool.publicKey, allow);
  const fee = feeOf(chain, tx);
  assert.ok(fee < allow, 'the allowance covers the fee');
  const result = chain.submit(tx);
  assert.equal(result.type, 'success', result.error);

  // The delegator still holds all of the NIGHT.
  assert.equal(chain.balanceOf(delegator), night);

  // The pool's DUST key received the backdated DUST, less the fee.
  const [note] = pool.utxos;
  assert.equal(pool.utxos.length, 1);
  assert.equal(note.owner, pool.publicKey);
  assert.equal(note.seq, 0);
  const rate = night * chain.params.dust.generationDecayRate;
  const accrued = rate * BigInt(2 * DAY + 6); // funding took one 6-second block
  assert.equal(note.initialValue, accrued - fee);

  // The event that created it is public and names the pool key and the NIGHT amount.
  const created = result.events.map((e) => e.content).find((c) => c.tag === 'dustInitialUtxo') as
    | { tag: 'dustInitialUtxo'; generation: L.DustGenerationInfo }
    | undefined;
  assert.ok(created);
  assert.equal(created.generation.owner, pool.publicKey);
  assert.equal(created.generation.value, night);
});

test('the same registration without an allowance is rejected: nothing else pays the fee', () => {
  const chain = new Chain();
  const delegator = newAccount();
  const utxo = chain.fund(delegator, 1_000n * STARS_PER_NIGHT);
  chain.advance(2 * DAY);
  const tx = registerTo(chain, delegator, utxo, L.sampleDustSecretKey().publicKey, 0n);
  assert.throws(() => chain.submit(tx), /[Bb]alanc|overspen|[Ff]ee/);
});

test('an allowance larger than the accrued DUST is rejected', () => {
  const chain = new Chain();
  const delegator = newAccount();
  const utxo = chain.fund(delegator, 1n * STARS_PER_NIGHT);
  chain.advance(60); // one minute: about 0.0005 DUST accrued
  const tx = registerTo(chain, delegator, utxo, L.sampleDustSecretKey().publicKey, SPECKS_PER_DUST);
  assert.throws(() => chain.submit(tx), /[Ii]nsufficient|registration/);
});

// ---------------------------------------------------------------------------
// A fill: the beneficiary leaves a payment, the operator pays the fee and
// collects it. Here the payment goes to a plain address; in the pool it goes
// to the contract through `settle`, which declares the same deficit.
// ---------------------------------------------------------------------------

interface World {
  chain: Chain;
  pool: DustWallet;
  operator: Account;
  beneficiary: Account;
  recipient: Account;
  anchor: L.Utxo;
  funds: L.Utxo;
}

const world = (): World => {
  const chain = new Chain();
  const delegator = newAccount();
  const operator = newAccount();
  const beneficiary = newAccount();
  const recipient = newAccount();
  const pool = new DustWallet(chain, randomBytes(32));
  const stake = chain.fund(delegator, 1_000n * STARS_PER_NIGHT);
  const anchor = chain.fund(operator, 1n * STARS_PER_NIGHT);
  const funds = chain.fund(beneficiary, 10n * STARS_PER_NIGHT);
  chain.advance(2 * DAY);
  const joined = chain.submit(registerTo(chain, delegator, stake, pool.publicKey, SPECKS_PER_DUST));
  assert.equal(joined.type, 'success', joined.error);
  return { chain, pool, operator, beneficiary, recipient, anchor, funds };
};

const PAYMENT = 200_000n; // 0.2 NIGHT
const SEND = 5n * STARS_PER_NIGHT;

/** The beneficiary's part: send 5 NIGHT, keep the change, leave PAYMENT unclaimed. No DUST. */
const beneficiaryPart = (w: World): OpenTx => {
  const intent = L.Intent.new(w.chain.ttl());
  intent.guaranteedUnshieldedOffer = L.UnshieldedOffer.new(
    [spendOf(w.funds, w.beneficiary)],
    [
      nightTo(w.recipient.address, SEND),
      nightTo(w.beneficiary.address, w.funds.value - SEND - PAYMENT),
    ].sort((a, b) => (a.owner < b.owner ? -1 : 1)),
    []
  );
  return txOf([[1, signIntent(intent, 1, w.beneficiary)]]);
};

const FEE_SEGMENT = 65_000;
const BLIND_SEGMENT = 65_001;

/**
 * The operator's part: a fee intent (a DustSpend plus a claim of the payment)
 * and, optionally, a blinding intent. Returned unbound so a caller can merge it
 * with the beneficiary part and then prove the whole.
 */
const operatorPart = (w: World, vFee: bigint, blinded: boolean) => {
  const [note] = w.pool.utxos;
  const { spend, successor } = w.pool.spend(note, vFee);
  const fee = L.Intent.new(w.chain.ttl());
  fee.guaranteedUnshieldedOffer = L.UnshieldedOffer.new(
    [],
    [nightTo(w.operator.address, PAYMENT)],
    []
  );
  fee.dustActions = new L.DustActions('signature', 'pre-proof', w.chain.date, [spend], []);
  const intents: Array<readonly [number, L.UnprovenIntent]> = [[FEE_SEGMENT, fee]];
  if (blinded) {
    const blind = L.Intent.new(w.chain.ttl());
    blind.guaranteedUnshieldedOffer = L.UnshieldedOffer.new(
      [spendOf(w.anchor, w.operator)],
      [nightTo(w.operator.address, w.anchor.value)],
      []
    );
    intents.push([BLIND_SEGMENT, signIntent(blind, BLIND_SEGMENT, w.operator)]);
  }
  return { tx: txOf(intents), spentNote: note, successor };
};

// NOTE ON SCOPE. These tests use the ledger's own `imbalances` and `fees`,
// which compute the exact per-segment balance rule, to show that a fill
// settles. They do not *apply* the fill, because applying a DUST spend needs a
// real ZK proof: the time-to-dismiss bound is sized for a proven transaction,
// and transcript partitioning (which arranges a real tx to fit) runs in the
// proof path, which is absent here. Applying a DUST spend is the devnet
// experiment VP-3 / VP-4; registration, which spends no DUST, is applied for
// real in the tests above.

const NIGHT = L.nativeToken().raw;

/** The segment-0 balance the ledger computes for a transaction, by token. */
const balanceBySegment0 = (
  tx: L.Transaction<L.Signaturish, L.Proofish, L.Bindingish>,
  fee: bigint
): { night: bigint; dust: bigint } => {
  let night = 0n;
  let dust = 0n;
  for (const [token, value] of tx.imbalances(0, fee)) {
    if (token.tag === 'dust') dust = value;
    else if (token.tag === 'unshielded' && token.raw === NIGHT) night = value;
  }
  return { night, dust };
};

test('the beneficiary part alone is short the fee in DUST, which it has none of', () => {
  const w = world();
  const user = beneficiaryPart(w);
  const fee = feeOf(w.chain, user.bind());
  const { night, dust } = balanceBySegment0(user, fee);
  // The payment is left unclaimed (a NIGHT surplus), and the fee is unpaid.
  assert.equal(night, PAYMENT);
  assert.equal(dust, -fee);
  // A negative balance is rejected: the beneficiary cannot pay on its own.
  assert.ok(dust < 0n);
});

test('the merged fill settles: the payment nets to zero and the DUST covers the fee', () => {
  const w = world();
  const user = beneficiaryPart(w);
  const { tx: provider } = operatorPart(w, 1n, true); // vFee patched below
  const merged = user.merge(provider);
  const fee = feeOf(w.chain, merged.bind());

  // Rebuild with a vFee that covers the merged fee, the way a provider quotes.
  const w2 = world();
  const user2 = beneficiaryPart(w2);
  const vFee = (fee * 12n) / 10n;
  const { tx: provider2, spentNote, successor } = operatorPart(w2, vFee, true);
  const settled = user2.merge(provider2);
  const settledFee = feeOf(w2.chain, settled.bind());
  const { night, dust } = balanceBySegment0(settled, settledFee);

  // The beneficiary's payment and the operator's claim of it cancel exactly.
  assert.equal(night, 0n);
  // The DUST spend covers the fee, with the surplus returned to the operator's note.
  assert.equal(dust, vFee - settledFee);
  assert.ok(dust >= 0n, 'the DUST spend covers the fee');
  assert.ok(vFee > settledFee);

  // What the operator spends and recreates are exactly what the pool contract
  // would publish for this note before and after `settle`.
  const published = publishedNoteOf(spentNote, w2.pool.key());
  const next = publishedNoteOf(successor, w2.pool.key());
  // The nullifier the operator spends is the one the contract stored for the
  // note; the commitment it recreates is the one `settle` stores next.
  assert.equal(L.dustNullifier(spentNote, w2.pool.key()), published.nul);
  assert.equal(L.dustCommitment(successor), next.cm);
});

test('a DUST UTXO spent twice yields the same nullifier, which the ledger blocks on reuse', () => {
  const w = world();
  const [note] = w.pool.utxos;
  const expected = L.dustNullifier(note, w.pool.key());

  // Two independent spends of the same UTXO.
  const a = w.pool.spend(note, 1_000n);
  const stale = new DustWallet(w.chain, w.pool.seed());
  const b = stale.spend(note, 2_000n);

  // Both carry the note's one nullifier, so the second to land hits the
  // ledger's spent-nullifier set and is rejected, whatever else it changes.
  assert.equal(a.spend.oldNullifier, expected);
  assert.equal(b.spend.oldNullifier, expected);
  assert.equal(a.spend.oldNullifier, b.spend.oldNullifier);
  // The two spends create different successors (different fees), so a watcher
  // seeing this nullifier settled by neither pool `settle` has proof of misuse.
  assert.notEqual(a.spend.newCommitment, b.spend.newCommitment);
});

// ---------------------------------------------------------------------------
// The two-part rule.
// ---------------------------------------------------------------------------

// The two-part rule. The ledger reveals only the sum of a transaction's parts'
// binding randomness (properties.md, Theorem 2), and merge combines parts by
// adding that randomness (structure.rs `merge`). So a party that contributes a
// single intent hands the counterparty a value it can isolate by subtraction;
// a party that contributes two does not. The exact field encoding of the
// exposed randomness is internal, so whether an isolated value can actually be
// re-bound to a new payload is settled on a real devnet with the proof server
// (experiment VP-1 / VP-2), not here. What is checkable in process is the
// structural fact underneath the rule: merge combines parts symmetrically.

test('merge combines binding randomness symmetrically, whatever the order', () => {
  const w = world();
  const user = beneficiaryPart(w);

  // Build the operator's two intents as their own bound transactions. The fee
  // value is immaterial here: this test inspects binding randomness, not balance.
  const [note] = w.pool.utxos;
  const { spend } = w.pool.spend(note, 2n * SPECKS_PER_DUST);
  const fee = L.Intent.new(w.chain.ttl());
  fee.guaranteedUnshieldedOffer = L.UnshieldedOffer.new(
    [],
    [nightTo(w.operator.address, PAYMENT)],
    []
  );
  fee.dustActions = new L.DustActions('signature', 'pre-proof', w.chain.date, [spend], []);
  const feeTx = txOf([[FEE_SEGMENT, fee]]);
  const blind = L.Intent.new(w.chain.ttl());
  blind.guaranteedUnshieldedOffer = L.UnshieldedOffer.new(
    [spendOf(w.anchor, w.operator)],
    [nightTo(w.operator.address, w.anchor.value)],
    []
  );
  const blindTx = txOf([[BLIND_SEGMENT, signIntent(blind, BLIND_SEGMENT, w.operator)]]);

  // The three parts can be merged in any order and grouping: the result's
  // binding randomness is the same. That symmetry is what lets a counterparty
  // cancel its own contribution, and why a lone contributed intent is exposed
  // while two intents are not. Whether an isolated value can actually be
  // re-bound to a new payload needs the proof server (VP-1 / VP-2).
  const a = user.merge(feeTx).merge(blindTx).bindingRandomness;
  const b = blindTx.merge(user).merge(feeTx).bindingRandomness;
  const c = feeTx.merge(blindTx).merge(user).bindingRandomness;
  assert.equal(a, b);
  assert.equal(a, c);

  // Merging a part changes the randomness, so no part is a no-op the others hide.
  assert.notEqual(user.merge(feeTx).bindingRandomness, user.bindingRandomness);
});

test('a lone operator fee intent, even bound, is rejected by the ledger', () => {
  const w = world();
  // The provider's fee intent pays out NIGHT nothing supplied: on its own it
  // is unbalanced, so the ledger rejects it. It is viable only merged with a
  // beneficiary part that leaves the matching payment.
  const { tx: provider } = operatorPart(w, 2n * SPECKS_PER_DUST, false);
  assert.throws(() => w.chain.submit(provider.bind()), /[Bb]alanc|overspen/);
});
