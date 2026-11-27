// The pool contract recomputes DUST commitments and nullifiers in-circuit.
// These tests check that its arithmetic equals the ledger's own, using the
// ledger 9 implementation shipped in @midnightntwrk/ledger-v9.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import * as ledger from '@midnightntwrk/ledger-v9';
import { pureCircuits } from '../src/managed/pool/contract/index.js';

const FIELD_MODULUS = ledger.maxField() + 1n;
const randomField = (): bigint => BigInt('0x' + randomBytes(40).toString('hex')) % FIELD_MODULUS;

const randomNote = (owner: bigint): ledger.QualifiedDustOutput => ({
  initialValue: BigInt('0x' + randomBytes(12).toString('hex')),
  owner,
  nonce: randomField(),
  seq: 3,
  ctime: new Date(1_790_000_000_000 + Math.floor(Math.random() * 1e9) * 1000),
  backingNight: randomBytes(32).toString('hex'),
  mtIndex: 7n,
});

test('in-circuit DUST public key equals the ledger public key', () => {
  for (let i = 0; i < 20; i++) {
    const sk = randomField();
    const expected = ledger.DustSecretKey.fromBigint(sk).publicKey;
    assert.equal(pureCircuits.dustPublicKey(sk), expected);
  }
});

test('in-circuit DUST commitment equals the ledger commitment', () => {
  for (let i = 0; i < 20; i++) {
    const sk = randomField();
    const pk = ledger.DustSecretKey.fromBigint(sk).publicKey;
    const note = randomNote(pk);
    const seconds = BigInt(note.ctime.getTime() / 1000);
    assert.equal(
      pureCircuits.dustCommitment(note.initialValue, pk, note.nonce, seconds),
      ledger.dustCommitment(note)
    );
  }
});

test('in-circuit DUST nullifier equals the ledger nullifier', () => {
  for (let i = 0; i < 20; i++) {
    const sk = randomField();
    const key = ledger.DustSecretKey.fromBigint(sk);
    const note = randomNote(key.publicKey);
    const seconds = BigInt(note.ctime.getTime() / 1000);
    assert.equal(
      pureCircuits.dustNullifier(note.initialValue, sk, note.nonce, seconds),
      ledger.dustNullifier(note, key)
    );
  }
});

test('a nullifier computed with the wrong key does not match', () => {
  const sk = randomField();
  const key = ledger.DustSecretKey.fromBigint(sk);
  const note = randomNote(key.publicKey);
  const seconds = BigInt(note.ctime.getTime() / 1000);
  assert.notEqual(
    pureCircuits.dustNullifier(note.initialValue, sk + 1n, note.nonce, seconds),
    ledger.dustNullifier(note, key)
  );
});
