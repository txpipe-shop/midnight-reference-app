// Contract logic, executed in the Compact runtime (no chain, no proofs).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import * as ledger from '@midnightntwrk/ledger-v9';
import { minimumUnits, openingOf, publishedNoteOf, STARS_PER_NIGHT } from '../src/notes.js';
import { PoolSimulator, type Caller } from '../src/simulator.js';

const FIELD_MODULUS = ledger.maxField() + 1n;
const randomField = (): bigint => BigInt('0x' + randomBytes(40).toString('hex')) % FIELD_MODULUS;

const EPOCH_START = 1_800_000_000n;
const EPOCH_LENGTH = 86_400n;
const STARS_PER_DUST = 200_000n; // 0.2 NIGHT per DUST
const FEE_BPS = 500n; // 5%

const operatorSk = randomField();
const operatorKey = ledger.DustSecretKey.fromBigint(operatorSk);
const operatorPayout = randomBytes(32);

const dustUtxo = (initialValue: bigint, seq: number, at: bigint): ledger.QualifiedDustOutput => ({
  initialValue,
  owner: operatorKey.publicKey,
  nonce: randomField(),
  seq,
  ctime: new Date(Number(at) * 1000),
  backingNight: randomBytes(32).toString('hex'),
  mtIndex: 0n,
});

const operator = (utxo?: ledger.QualifiedDustOutput): Caller => ({
  dustSecretKey: operatorSk,
  opening: utxo ? openingOf(utxo) : undefined,
});

const deploy = (overrides: Parameters<typeof PoolSimulator.deploy>[1] = {}) =>
  PoolSimulator.deploy(
    {
      dustKey: operatorKey.publicKey,
      operatorPayout,
      operatorFeeBps: FEE_BPS,
      starsPerDust: STARS_PER_DUST,
      minNight: 1n * STARS_PER_NIGHT,
      epochStart: EPOCH_START,
      epochLength: EPOCH_LENGTH,
    },
    overrides
  );

const startOf = (epoch: bigint) => EPOCH_START + epoch * EPOCH_LENGTH + 10n;

const nativeNight = (map: Map<ledger.TokenType, bigint> | undefined): bigint => {
  let total = 0n;
  for (const [token, value] of map ?? []) {
    assert.equal(token.tag, 'unshielded');
    total += value;
  }
  return total;
};

test('enroll stores the commitment and nullifier the ledger assigns to the UTXO', async () => {
  const pool = await deploy();
  const id = randomBytes(32);
  const owner = randomBytes(32);
  const utxo = dustUtxo(0n, 0, EPOCH_START);
  await pool.enroll(operator(utxo), id, 100n * STARS_PER_NIGHT, owner, 0n);

  const stored = pool.ledger.notes.lookup(id);
  const expected = publishedNoteOf(utxo, operatorKey);
  assert.equal(stored.cm, expected.cm);
  assert.equal(stored.nul, expected.nul);
  assert.deepEqual(Buffer.from(stored.owner.bytes), owner);
  assert.equal(pool.ledger.joinedAt.lookup(0n), 100n * STARS_PER_NIGHT);
});

test('only the holder of the pool DUST key can enroll, settle or retire', async () => {
  const pool = await deploy();
  const id = randomBytes(32);
  const utxo = dustUtxo(0n, 0, EPOCH_START);
  const impostor: Caller = { dustSecretKey: operatorSk + 1n, opening: openingOf(utxo) };

  await assert.rejects(
    pool.enroll(impostor, id, 100n * STARS_PER_NIGHT, randomBytes(32), 0n),
    /not the pool's DUST key/
  );
  await pool.enroll(operator(utxo), id, 100n * STARS_PER_NIGHT, randomBytes(32), 0n);
  await assert.rejects(pool.settle(impostor, id, 0n, 1n, 1n), /not the pool's DUST key/);
  await assert.rejects(pool.retire(impostor, id, 0n), /not the pool's DUST key/);
});

test('enroll rejects duplicates, small notes and the wrong epoch', async () => {
  const pool = await deploy();
  const id = randomBytes(32);
  const utxo = dustUtxo(0n, 0, EPOCH_START);
  await assert.rejects(
    pool.enroll(operator(utxo), id, STARS_PER_NIGHT - 1n, randomBytes(32), 0n),
    /below the minimum NIGHT/
  );
  await assert.rejects(
    pool.enroll(operator(utxo), id, 5n * STARS_PER_NIGHT, randomBytes(32), 1n),
    /wrong epoch/
  );
  await pool.enroll(operator(utxo), id, 5n * STARS_PER_NIGHT, randomBytes(32), 0n);
  await assert.rejects(
    pool.enroll(operator(utxo), id, 5n * STARS_PER_NIGHT, randomBytes(32), 0n),
    /note already enrolled/
  );
});

test('settle enforces the price floor, takes the payment and republishes the note', async () => {
  const pool = await deploy();
  const id = randomBytes(32);
  const first = dustUtxo(0n, 0, EPOCH_START);
  await pool.enroll(operator(first), id, 100n * STARS_PER_NIGHT, randomBytes(32), 0n);

  const vFee = 600_000_000_000_000n; // 0.6 DUST
  const floor = minimumUnits(vFee, STARS_PER_DUST); // 0.12 NIGHT = 120 units
  assert.equal(floor, 120n);
  const next = dustUtxo(1_400_000_000_000_000n, 1, EPOCH_START + 60n);

  pool.now = EPOCH_START + 60n;
  await assert.rejects(
    pool.settle(operator(next), id, 0n, vFee, floor - 1n),
    /payment below the price floor/
  );
  await pool.settle(operator(next), id, 0n, vFee, floor);

  // The contract declares an unshielded NIGHT input equal to the payment and
  // nothing else: it is short by exactly the amount the beneficiary must leave.
  assert.equal(nativeNight(pool.lastEffects?.unshieldedInputs), floor * 1000n);
  assert.equal(nativeNight(pool.lastEffects?.unshieldedOutputs), 0n);
  assert.equal(pool.lastEffects?.claimedUnshieldedSpends.size, 0);

  const stored = pool.ledger.notes.lookup(id);
  const expected = publishedNoteOf(next, operatorKey);
  assert.equal(stored.cm, expected.cm);
  assert.equal(stored.nul, expected.nul);
  assert.equal(stored.lastFee, vFee);
  assert.equal(pool.ledger.revenue.lookup(0n).read(), floor);
});

test('revenue is split pro rata to active NIGHT, after the operator fee', async () => {
  const pool = await deploy();
  const alice = { id: randomBytes(32), owner: randomBytes(32), night: 100n * STARS_PER_NIGHT };
  const bob = { id: randomBytes(32), owner: randomBytes(32), night: 300n * STARS_PER_NIGHT };

  // Epoch 0: both join. A fill in the join epoch has no active NIGHT to pay.
  await pool.enroll(operator(dustUtxo(0n, 0, EPOCH_START)), alice.id, alice.night, alice.owner, 0n);
  await pool.enroll(operator(dustUtxo(0n, 0, EPOCH_START)), bob.id, bob.night, bob.owner, 0n);
  await pool.settle(operator(dustUtxo(1n, 1, EPOCH_START)), alice.id, 0n, 1n, 1_000n); // 1 NIGHT

  await assert.rejects(pool.closeEpoch(), /epoch still open/);
  await assert.rejects(pool.claim(alice.id), /join epoch not closed yet/);

  // Epoch 1: the pool earns 3 NIGHT more.
  pool.now = startOf(1n);
  await pool.closeEpoch(); // closes epoch 0, carries its 1 NIGHT forward
  assert.equal(pool.ledger.carry, 1n * STARS_PER_NIGHT);
  assert.equal(pool.ledger.activeNight, 400n * STARS_PER_NIGHT);
  await pool.settle(operator(dustUtxo(2n, 2, startOf(1n))), bob.id, 1n, 1n, 3_000n);

  // Epoch 2: close epoch 1 and distribute 4 NIGHT.
  pool.now = startOf(2n);
  await pool.closeEpoch();
  await pool.claim(alice.id);
  await pool.claim(bob.id);

  const gross = 4n * STARS_PER_NIGHT;
  const fee = (gross * FEE_BPS) / 10_000n;
  const net = gross - fee;
  const credit = (owner: Uint8Array) => pool.ledger.credits.lookup({ bytes: owner });
  assert.equal(credit(operatorPayout), fee);
  assert.equal(credit(alice.owner), net / 4n);
  assert.equal(credit(bob.owner), (net * 3n) / 4n);
  assert.equal(credit(operatorPayout) + credit(alice.owner) + credit(bob.owner), gross);

  // Claiming twice pays nothing more.
  await pool.claim(alice.id);
  assert.equal(credit(alice.owner), net / 4n);
});

test('payout sends the credit to the address that earned it, and only once', async () => {
  const pool = await deploy();
  const alice = { id: randomBytes(32), owner: randomBytes(32), night: 50n * STARS_PER_NIGHT };
  await pool.enroll(operator(dustUtxo(0n, 0, EPOCH_START)), alice.id, alice.night, alice.owner, 0n);
  pool.now = startOf(1n);
  await pool.closeEpoch();
  await pool.settle(operator(dustUtxo(1n, 1, startOf(1n))), alice.id, 1n, 1n, 2_000n);
  pool.now = startOf(2n);
  await pool.closeEpoch();
  await pool.claim(alice.id);

  const expected = 2n * STARS_PER_NIGHT - (2n * STARS_PER_NIGHT * FEE_BPS) / 10_000n;
  await pool.payout(alice.owner);
  assert.equal(nativeNight(pool.lastEffects?.unshieldedOutputs), expected);
  const spends = [...(pool.lastEffects?.claimedUnshieldedSpends ?? [])];
  assert.equal(spends.length, 1);
  const [[, recipient], amount] = spends[0];
  assert.equal(amount, expected);
  assert.deepEqual(recipient, {
    tag: 'user',
    address: Buffer.from(alice.owner).toString('hex'),
  });
  assert.equal(pool.ledger.credits.lookup({ bytes: alice.owner }), 0n);
  await assert.rejects(pool.payout(alice.owner), /nothing to pay/);
});

test('a retired note earns through its leave epoch and no further', async () => {
  const pool = await deploy();
  const alice = { id: randomBytes(32), owner: randomBytes(32), night: 100n * STARS_PER_NIGHT };
  const bob = { id: randomBytes(32), owner: randomBytes(32), night: 100n * STARS_PER_NIGHT };
  await pool.enroll(operator(dustUtxo(0n, 0, EPOCH_START)), alice.id, alice.night, alice.owner, 0n);
  await pool.enroll(operator(dustUtxo(0n, 0, EPOCH_START)), bob.id, bob.night, bob.owner, 0n);

  // Epoch 1: 2 NIGHT of revenue, and Bob's NIGHT leaves.
  pool.now = startOf(1n);
  await pool.closeEpoch();
  await pool.settle(operator(dustUtxo(1n, 1, startOf(1n))), alice.id, 1n, 1n, 2_000n);
  await pool.retire(operator(), bob.id, 1n);
  await assert.rejects(pool.settle(operator(dustUtxo(1n, 1, startOf(1n))), bob.id, 1n, 1n, 1n), /note is retired/);
  await assert.rejects(pool.claim(bob.id), /leave epoch not closed yet/);

  // Epoch 2: 2 NIGHT more, now earned by Alice alone.
  pool.now = startOf(2n);
  await pool.closeEpoch();
  assert.equal(pool.ledger.activeNight, 100n * STARS_PER_NIGHT);
  await pool.settle(operator(dustUtxo(2n, 2, startOf(2n))), alice.id, 2n, 1n, 2_000n);
  pool.now = startOf(3n);
  await pool.closeEpoch();

  await pool.claim(alice.id);
  await pool.claim(bob.id);
  const net = 2n * STARS_PER_NIGHT - (2n * STARS_PER_NIGHT * FEE_BPS) / 10_000n;
  assert.equal(pool.ledger.credits.lookup({ bytes: bob.owner }), net / 2n);
  assert.equal(pool.ledger.credits.lookup({ bytes: alice.owner }), net / 2n + net);
});

test('a dishonest quotient witness is rejected', async () => {
  for (const [skew, message] of [
    [1n, /quotient too large/],
    [-1n, /quotient too small/],
  ] as const) {
    const pool = await deploy({
      quotient: ({ privateState }, numerator, denominator) => [
        privateState,
        numerator / denominator + skew,
      ],
    });
    const id = randomBytes(32);
    await pool.enroll(operator(dustUtxo(0n, 0, EPOCH_START)), id, 100n * STARS_PER_NIGHT, randomBytes(32), 0n);
    await pool.settle(operator(dustUtxo(1n, 1, EPOCH_START)), id, 0n, 1n, 2_000n);
    pool.now = startOf(1n);
    await assert.rejects(pool.closeEpoch(), message);
  }
});
