import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { SignedEnrollment } from '@midnight-sentinel/api/sponsorship/eligibility';
import { EligibilityDatabase } from '../src/database.js';

const databases: EligibilityDatabase[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const enrollment = (nonce: string): SignedEnrollment => ({
  payload: {
    version: 1,
    network: 'undeployed',
    sentinelAddress: '11'.repeat(32),
    sponsorDustAddress: 'dust_undeployed1test',
    nightRewardAddress: 'addr_undeployed1test',
    nightVerificationKey: 'aa'.repeat(35),
    shieldedCoinPublicKey: '22'.repeat(32),
    shieldedEncryptionPublicKey: '33'.repeat(32),
    nonce,
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
  signature: '44'.repeat(67),
});

describe('EligibilityDatabase', () => {
  it('retains the highest enrollment nonce as a tombstone', () => {
    const database = new EligibilityDatabase(':memory:');
    databases.push(database);
    const identity = '55'.repeat(32);
    database.putEnrollment(identity, enrollment('2'), 2n);
    assert.throws(
      () => database.putEnrollment(identity, enrollment('1'), 1n),
      /ENROLLMENT_REPLAYED/
    );
    assert.equal(database.getEnrollment(identity)?.nonce, 2n);
  });

  it('sums only registered NIGHT assigned to the sponsor', () => {
    const database = new EligibilityDatabase(':memory:');
    databases.push(database);
    database.applyUtxoChanges(
      'address',
      [],
      [
        {
          key: 'a:0',
          tokenType: 'night',
          value: 4n,
          registered: true,
          dustKey: 'sponsor',
        },
        {
          key: 'b:0',
          tokenType: 'night',
          value: 8n,
          registered: true,
          dustKey: 'other',
        },
        {
          key: 'c:0',
          tokenType: 'night',
          value: 16n,
          registered: false,
          dustKey: 'sponsor',
        },
      ]
    );
    assert.equal(database.qualifyingBalance('address', 'night', 'sponsor'), 4n);
    database.applyUtxoChanges('address', ['a:0'], []);
    assert.equal(database.qualifyingBalance('address', 'night', 'sponsor'), 0n);
  });
});
