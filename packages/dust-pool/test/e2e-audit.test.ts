// End to end: drive the contract through enroll and fills, then run the
// auditor over its public state against simulated on-chain DUST spends.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import * as ledger from '@midnightntwrk/ledger-v9';
import { audit } from '../src/auditor.js';
import { minimumUnits, openingOf, publishedNoteOf, STARS_PER_NIGHT } from '../src/notes.js';
import { PoolSimulator, spentNullifiersOf, type Caller } from '../src/simulator.js';

const FIELD = ledger.maxField() + 1n;
const randomField = () => BigInt('0x' + randomBytes(40).toString('hex')) % FIELD;
const EPOCH_START = 1_800_000_000n;
const STARS_PER_DUST = 200_000n;

test('the auditor passes an honest pool and catches a diverted spend', async () => {
  const sk = randomField();
  const key = ledger.DustSecretKey.fromBigint(sk);
  const pool = await PoolSimulator.deploy({
    dustKey: key.publicKey,
    operatorPayout: randomBytes(32),
    operatorFeeBps: 500n,
    starsPerDust: STARS_PER_DUST,
    minNight: STARS_PER_NIGHT,
    epochStart: EPOCH_START,
    epochLength: 86_400n,
  });

  const id = randomBytes(32);
  const utxo = (value: bigint, seq: number, at: bigint): ledger.QualifiedDustOutput => ({
    initialValue: value,
    owner: key.publicKey,
    nonce: randomField(),
    seq,
    ctime: new Date(Number(at) * 1000),
    backingNight: randomBytes(32).toString('hex'),
    mtIndex: 0n,
  });
  const op = (u: ledger.QualifiedDustOutput): Caller => ({
    dustSecretKey: sk,
    opening: openingOf(u),
  });

  const n0 = utxo(0n, 0, EPOCH_START);
  await pool.enroll(op(n0), id, 100n * STARS_PER_NIGHT, randomBytes(32), 0n);

  // Two honest fills. Each consumes the current note and publishes the next.
  const fills: Array<{ nullifier: bigint; fee: bigint; units: bigint }> = [];
  let spent = n0;
  for (let i = 0; i < 2; i++) {
    const fee = 600_000_000_000_000n;
    const units = minimumUnits(fee, STARS_PER_DUST);
    const next = utxo(1_400_000_000_000_000n, i + 1, EPOCH_START + BigInt(60 * (i + 1)));
    pool.now = EPOCH_START + BigInt(60 * (i + 1));
    await pool.settle(op(next), id, 0n, fee, units);
    fills.push({ nullifier: publishedNoteOf(spent, key).nul, fee, units });
    spent = next;
  }

  // The contract recorded exactly the two consumed nullifiers.
  const recorded = spentNullifiersOf(pool.ledger);
  assert.deepEqual(new Set(recorded), new Set(fills.map((f) => f.nullifier)));

  // Honest case: the on-chain spends are exactly the fills.
  const honest = audit({
    settled: fills,
    observed: fills.map((f) => ({ nullifier: f.nullifier, vFee: f.fee })),
    starsPerDust: STARS_PER_DUST,
  });
  assert.equal(honest.ok, true);

  // Dishonest case: the operator also spent a pooled note off-pool. Its
  // nullifier never reached `settle`, so the audit fails and names it.
  const diverted = publishedNoteOf(spent, key).nul;
  const caught = audit({
    settled: fills,
    observed: [
      ...fills.map((f) => ({ nullifier: f.nullifier, vFee: f.fee })),
      { nullifier: diverted, vFee: 800_000_000_000_000n },
    ],
    starsPerDust: STARS_PER_DUST,
  });
  assert.equal(caught.ok, false);
  assert.equal(caught.diversions.length, 1);
  assert.equal(caught.diversions[0].nullifier, diverted);
});
