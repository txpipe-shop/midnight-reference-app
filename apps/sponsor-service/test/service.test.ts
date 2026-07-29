import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addressFromKey,
  sampleSigningKey,
  signData,
  signatureVerifyingKey,
} from '@midnight-ntwrk/ledger-v8';
import { MidnightBech32m, UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import {
  createMidnightEnrollmentVerifier,
  enrollmentSigningBytes,
  type EnrollmentPayload,
} from '@midnight-sentinel/api/sponsorship/eligibility';
import { EligibilityDatabase } from '../src/database.js';
import type { MidnightIndexerScanner } from '../src/indexer.js';
import type { ContractQueueOperator } from '../src/operator.js';
import { EligibilityService } from '../src/service.js';

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out');
};

describe('EligibilityService', () => {
  it('enrolls from finalized status and removes after finalized invalidation', async () => {
    const signingKey = sampleSigningKey();
    const verificationKey = signatureVerifyingKey(signingKey);
    const address = MidnightBech32m.encode(
      'undeployed',
      new UnshieldedAddress(Buffer.from(addressFromKey(verificationKey), 'hex'))
    ).toString();
    const payload: EnrollmentPayload = {
      version: 1,
      network: 'undeployed',
      sentinelAddress: '11'.repeat(32),
      sponsorDustAddress: 'dust',
      nightRewardAddress: address,
      nightVerificationKey: verificationKey,
      shieldedCoinPublicKey: '22'.repeat(32),
      shieldedEncryptionPublicKey: '33'.repeat(32),
      nonce: '1',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
    const enrollment = {
      payload,
      signature: signData(signingKey, enrollmentSigningBytes(payload)),
    };
    let balance = 2n;
    const scanner = {
      latestFinalizedBlock: async () => 10n,
      sync: async () => ({
        nightRewardAddress: address,
        dustAddress: balance > 0n ? 'dust' : undefined,
        registered: balance > 0n,
        nightBalance: balance,
        finalizedBlock: 10n,
        synchronized: true,
      }),
    } as unknown as MidnightIndexerScanner;
    let currentNonce: bigint | undefined;
    let removed = false;
    const operator = {
      lookup: async () =>
        currentNonce === undefined ? undefined : { enrollmentNonce: currentNonce },
      add: async (input: { enrollmentNonce: bigint }) => {
        currentNonce = input.enrollmentNonce;
      },
      update: async (input: { enrollmentNonce: bigint }) => {
        currentNonce = input.enrollmentNonce;
      },
      remove: async () => {
        currentNonce = undefined;
        removed = true;
      },
    } as unknown as ContractQueueOperator;
    const database = new EligibilityDatabase(':memory:');
    const service = new EligibilityService(
      database,
      scanner,
      operator,
      {
        network: 'undeployed',
        sentinelAddress: payload.sentinelAddress,
        sponsorDustAddress: 'dust',
        minimumRegisteredNight: 1n,
      },
      createMidnightEnrollmentVerifier('undeployed'),
      60_000
    );

    const { jobId } = service.submit(enrollment);
    await waitFor(() => service.getJob(jobId)?.status === 'active');
    assert.equal(service.getStatus(address)?.nightBalance, 2n);

    balance = 0n;
    await service.revalidate();
    assert.equal(removed, true);
    assert.equal(service.getStatus(address)?.registered, false);
    database.close();
  });
});
