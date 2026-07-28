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
  createHttpMidnightRegistrationProvider,
  createMidnightEnrollmentVerifier,
  enrollmentSigningBytes,
  verifyEnrollment,
  type EnrollmentPayload,
} from '@midnight-sentinel/api/sponsorship/eligibility';

const signedEnrollment = () => {
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
    sponsorDustAddress: 'mn_dust_undeployed1test',
    nightRewardAddress: address,
    nightVerificationKey: verificationKey,
    shieldedCoinPublicKey: '22'.repeat(32),
    shieldedEncryptionPublicKey: '33'.repeat(32),
    nonce: '1',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
  return {
    payload,
    signature: signData(signingKey, enrollmentSigningBytes(payload)),
  };
};

describe('Midnight enrollment verification', () => {
  it('binds the signed verification key to the unshielded address', () => {
    const enrollment = signedEnrollment();
    const verified = verifyEnrollment(
      enrollment,
      {
        network: 'undeployed',
        sentinelAddress: enrollment.payload.sentinelAddress,
        sponsorDustAddress: enrollment.payload.sponsorDustAddress,
      },
      createMidnightEnrollmentVerifier('undeployed')
    );
    assert.equal(verified.nightRewardAddress, enrollment.payload.nightRewardAddress);

    const other = signedEnrollment();
    assert.throws(() =>
      verifyEnrollment(
        {
          ...enrollment,
          payload: {
            ...enrollment.payload,
            nightRewardAddress: other.payload.nightRewardAddress,
          },
        },
        {
          network: 'undeployed',
          sentinelAddress: enrollment.payload.sentinelAddress,
          sponsorDustAddress: enrollment.payload.sponsorDustAddress,
        },
        createMidnightEnrollmentVerifier('undeployed')
      )
    );
  });

  it('decodes synchronized HTTP status into bigint values', async () => {
    const provider = createHttpMidnightRegistrationProvider(
      'http://eligibility.test/',
      async () =>
        new Response(
          JSON.stringify({
            nightRewardAddress: 'address',
            dustAddress: 'dust',
            registered: true,
            nightBalance: '42',
            finalizedBlock: '7',
            synchronized: true,
          }),
          { status: 200 }
        )
    );
    const status = await provider.getStatus('address');
    assert.equal(status.nightBalance, 42n);
    assert.equal(status.finalizedBlock, 7n);
  });
});
