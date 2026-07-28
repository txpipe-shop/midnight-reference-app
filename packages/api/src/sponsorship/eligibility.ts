import { createHash } from 'node:crypto';
import { addressFromKey, verifySignature } from '@midnight-ntwrk/ledger-v8';
import { MidnightBech32m, UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';

export type Hex32 = string;

export interface EnrollmentPayload {
  version: 1;
  network: string;
  sentinelAddress: Hex32;
  sponsorDustAddress: string;
  nightRewardAddress: string;
  nightVerificationKey: string;
  shieldedCoinPublicKey: Hex32;
  shieldedEncryptionPublicKey: Hex32;
  nonce: string;
  expiresAt: string;
}

export interface SignedEnrollment {
  payload: EnrollmentPayload;
  signature: string;
}

export interface EnrollmentSignatureVerifier {
  verify(input: {
    verificationKey: string;
    address: string;
    message: Uint8Array;
    signature: string;
  }): boolean;
}

export interface EnrollmentExpectation {
  network: string;
  sentinelAddress: string;
  sponsorDustAddress: string;
  now?: Date;
}

export class EligibilityError extends Error {
  constructor(
    readonly code:
      | 'ENROLLMENT_INVALID'
      | 'ENROLLMENT_EXPIRED'
      | 'ENROLLMENT_REPLAYED'
      | 'ELIGIBILITY_QUERY_FAILED'
      | 'DELEGATOR_STALE',
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'EligibilityError';
  }
}

const normalizedHex32 = (value: string, label: string) => {
  const normalized = value.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new EligibilityError('ENROLLMENT_INVALID', `${label} must be 32-byte hex`);
  }
  return normalized;
};

const canonicalPayload = (payload: EnrollmentPayload) => ({
  version: payload.version,
  network: payload.network,
  sentinelAddress: normalizedHex32(payload.sentinelAddress, 'sentinelAddress'),
  sponsorDustAddress: payload.sponsorDustAddress,
  nightRewardAddress: payload.nightRewardAddress,
  nightVerificationKey: payload.nightVerificationKey.toLowerCase(),
  shieldedCoinPublicKey: normalizedHex32(payload.shieldedCoinPublicKey, 'shieldedCoinPublicKey'),
  shieldedEncryptionPublicKey: normalizedHex32(
    payload.shieldedEncryptionPublicKey,
    'shieldedEncryptionPublicKey'
  ),
  nonce: BigInt(payload.nonce).toString(),
  expiresAt: new Date(payload.expiresAt).toISOString(),
});

export const enrollmentSigningBytes = (payload: EnrollmentPayload) =>
  Uint8Array.from(
    Buffer.from(
      JSON.stringify({
        domain: 'midnight-sentinel/delegator-enrollment',
        ...canonicalPayload(payload),
      }),
      'utf8'
    )
  );

export const enrollmentIdentity = (nightRewardAddress: string) =>
  Uint8Array.from(
    createHash('sha256')
      .update('midnight-sentinel/night-identity/v1\0')
      .update(nightRewardAddress)
      .digest()
  );

export const verifyEnrollment = (
  enrollment: SignedEnrollment,
  expected: EnrollmentExpectation,
  verifier: EnrollmentSignatureVerifier
) => {
  let canonical: ReturnType<typeof canonicalPayload>;
  try {
    canonical = canonicalPayload(enrollment.payload);
  } catch (error) {
    if (error instanceof EligibilityError) throw error;
    throw new EligibilityError('ENROLLMENT_INVALID', 'Malformed enrollment payload', {
      cause: error,
    });
  }
  if (
    canonical.version !== 1 ||
    canonical.network !== expected.network ||
    canonical.sentinelAddress !== normalizedHex32(expected.sentinelAddress, 'sentinelAddress') ||
    canonical.sponsorDustAddress !== expected.sponsorDustAddress
  ) {
    throw new EligibilityError('ENROLLMENT_INVALID', 'Enrollment does not match the campaign');
  }
  if (new Date(canonical.expiresAt).getTime() <= (expected.now ?? new Date()).getTime()) {
    throw new EligibilityError('ENROLLMENT_EXPIRED', 'Enrollment has expired');
  }
  const valid = verifier.verify({
    verificationKey: canonical.nightVerificationKey,
    address: canonical.nightRewardAddress,
    message: enrollmentSigningBytes(enrollment.payload),
    signature: enrollment.signature,
  });
  if (!valid) {
    throw new EligibilityError('ENROLLMENT_INVALID', 'Invalid NIGHT signature');
  }
  return {
    ...canonical,
    nonce: BigInt(canonical.nonce),
    identity: enrollmentIdentity(canonical.nightRewardAddress),
  };
};

export interface DustGenerationStatus {
  nightRewardAddress: string;
  dustAddress?: string;
  registered: boolean;
  nightBalance: bigint;
  finalizedBlock: bigint;
  synchronized?: boolean;
}

export interface MidnightRegistrationProvider {
  getStatus(nightRewardAddress: string): Promise<DustGenerationStatus>;
}

export const createMidnightEnrollmentVerifier = (network: string): EnrollmentSignatureVerifier => ({
  verify: ({ verificationKey, address, message, signature }) => {
    try {
      const decoded = UnshieldedAddress.codec.decode(network, MidnightBech32m.parse(address));
      return (
        decoded.hexString === addressFromKey(verificationKey) &&
        verifySignature(verificationKey, message, signature)
      );
    } catch {
      return false;
    }
  },
});

export const createHttpMidnightRegistrationProvider = (
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): MidnightRegistrationProvider => ({
  async getStatus(nightRewardAddress) {
    const response = await fetchImpl(
      `${baseUrl.replace(/\/$/, '')}/v1/eligibility/${encodeURIComponent(nightRewardAddress)}`
    );
    if (!response.ok) {
      throw new EligibilityError(
        'ELIGIBILITY_QUERY_FAILED',
        `Eligibility service returned HTTP ${response.status}`
      );
    }
    const value = (await response.json()) as {
      nightRewardAddress: string;
      dustAddress?: string;
      registered: boolean;
      nightBalance: string;
      finalizedBlock: string;
      synchronized: boolean;
    };
    if (!value.synchronized) {
      throw new EligibilityError(
        'ELIGIBILITY_QUERY_FAILED',
        'Eligibility status is not synchronized'
      );
    }
    return {
      ...value,
      nightBalance: BigInt(value.nightBalance),
      finalizedBlock: BigInt(value.finalizedBlock),
    };
  },
});

export const assertEligible = (
  status: DustGenerationStatus,
  sponsorDustAddress: string,
  minimumNight: bigint
) => {
  if (
    status.synchronized === false ||
    !status.registered ||
    status.dustAddress !== sponsorDustAddress ||
    status.nightBalance < minimumNight
  ) {
    throw new EligibilityError(
      'DELEGATOR_STALE',
      'Delegator is no longer eligible for this campaign'
    );
  }
  return status;
};

export interface EligibilityCampaign {
  network: string;
  sentinelAddress: string;
  sponsorDustAddress: string;
  minimumRegisteredNight: bigint;
}

export interface EligibilityQueueOperator {
  lookup(identity: Uint8Array): Promise<{ enrollmentNonce: bigint } | undefined>;
  add(input: {
    identity: Uint8Array;
    nightRewardAddress: Uint8Array;
    rewardKey: Uint8Array;
    rewardEncryptionKey: Uint8Array;
    registeredAmount: bigint;
    verificationBlock: bigint;
    enrollmentNonce: bigint;
  }): Promise<unknown>;
  update(input: {
    identity: Uint8Array;
    nightRewardAddress: Uint8Array;
    rewardKey: Uint8Array;
    rewardEncryptionKey: Uint8Array;
    registeredAmount: bigint;
    verificationBlock: bigint;
    enrollmentNonce: bigint;
  }): Promise<unknown>;
}

const paddedAddress = (address: string) => {
  const encoded = Buffer.from(address, 'utf8');
  if (encoded.length > 96) {
    throw new EligibilityError('ENROLLMENT_INVALID', 'NIGHT reward address exceeds 96 bytes');
  }
  const result = new Uint8Array(96);
  result.set(encoded);
  return result;
};

export const enrollDelegator = async (options: {
  enrollment: SignedEnrollment;
  campaign: EligibilityCampaign;
  verifier: EnrollmentSignatureVerifier;
  registrationProvider: MidnightRegistrationProvider;
  verificationBlock: bigint;
  operator: EligibilityQueueOperator;
}) => {
  const verified = verifyEnrollment(options.enrollment, options.campaign, options.verifier);
  const current = await options.operator.lookup(verified.identity);
  if (current && verified.nonce <= current.enrollmentNonce) {
    throw new EligibilityError('ENROLLMENT_REPLAYED', 'Enrollment nonce must increase');
  }
  const status = assertEligible(
    await options.registrationProvider.getStatus(verified.nightRewardAddress),
    options.campaign.sponsorDustAddress,
    options.campaign.minimumRegisteredNight
  );
  const input = {
    identity: verified.identity,
    nightRewardAddress: paddedAddress(verified.nightRewardAddress),
    rewardKey: Uint8Array.from(Buffer.from(verified.shieldedCoinPublicKey, 'hex')),
    rewardEncryptionKey: Uint8Array.from(Buffer.from(verified.shieldedEncryptionPublicKey, 'hex')),
    registeredAmount: status.nightBalance,
    verificationBlock: options.verificationBlock,
    enrollmentNonce: verified.nonce,
  };
  await (current ? options.operator.update(input) : options.operator.add(input));
  return { action: current ? ('updated' as const) : ('added' as const), ...input };
};
