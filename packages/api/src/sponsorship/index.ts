import { createHash } from 'node:crypto';
import type { MidnightRegistrationProvider } from './eligibility.js';

export type SponsorshipStage =
  | 'preparation'
  | 'inspection'
  | 'balancing'
  | 'submission'
  | 'confirmation';

export type SponsorshipErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_SERIALIZATION'
  | 'INVALID_COMMUNICATION_COMMITMENT'
  | 'TARGET_CALL_INVALID'
  | 'WRONG_CALL_COUNT'
  | 'UNEXPECTED_ACTION'
  | 'WRONG_SPONSORSHIP_CONTRACT'
  | 'WRONG_SPONSORSHIP_ENTRY_POINT'
  | 'UNAPPROVED_TARGET'
  | 'PURCHASE_NOT_GUARANTEED'
  | 'DUST_ALREADY_PRESENT'
  | 'TTL_OUT_OF_RANGE'
  | 'FEE_TOO_HIGH'
  | 'UNRELATED_TRANSFER'
  | 'CAMPAIGN_UNAVAILABLE'
  | 'CAMPAIGN_PAUSED'
  | 'CAMPAIGN_MISMATCH'
  | 'PAYMENT_COIN_UNAVAILABLE'
  | 'TARGET_ALREADY_SPONSORED'
  | 'RECEIPT_MISMATCH'
  | 'STALE_CONTRACT_STATE'
  | 'NO_ELIGIBLE_DELEGATOR'
  | 'DELEGATOR_STALE'
  | 'REWARD_DELIVERY_FAILED'
  | 'ENROLLMENT_INVALID'
  | 'ENROLLMENT_REPLAYED'
  | 'CAMPAIGN_VERSION_UNSUPPORTED'
  | 'PROOF_GENERATION_FAILED'
  | 'BENEFICIARY_BALANCE_FAILED'
  | 'SPONSOR_BALANCE_FAILED'
  | 'SUBMISSION_FAILED'
  | 'CONFIRMATION_FAILED'
  | 'INTERNAL_ERROR';

export interface SponsorshipErrorOptions {
  stage: SponsorshipStage;
  retryable?: boolean;
  cause?: unknown;
}

export class SponsorshipError extends Error {
  readonly code: SponsorshipErrorCode;
  readonly stage: SponsorshipStage;
  readonly retryable: boolean;

  constructor(
    code: SponsorshipErrorCode,
    message: string,
    options: SponsorshipErrorOptions
  ) {
    super(message, { cause: options.cause });
    this.name = 'SponsorshipError';
    this.code = code;
    this.stage = options.stage;
    this.retryable = options.retryable ?? false;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      stage: this.stage,
      retryable: this.retryable,
      message: this.message,
    };
  }
}

export interface SponsorshipTargetPolicy {
  address: string;
  entryPoint: string;
}

export const sponsorshipAllowlistHash = (
  targets: readonly SponsorshipTargetPolicy[]
): Uint8Array => {
  const canonical = [...targets]
    .map(({ address, entryPoint }) => ({
      address: address.toLowerCase(),
      entryPoint,
    }))
    .sort(
      (left, right) =>
        left.address.localeCompare(right.address) ||
        left.entryPoint.localeCompare(right.entryPoint)
    );
  return Uint8Array.from(
    createHash('sha256')
      .update(JSON.stringify({ version: 1, targets: canonical }))
      .digest()
  );
};

export interface SponsorshipPolicy {
  sentinelAddress: string;
  sponsorId: Uint8Array;
  sponsorDustAddress: string;
  registrationProvider: MidnightRegistrationProvider;
  policyHash: Uint8Array;
  allowedTargets: readonly SponsorshipTargetPolicy[];
  minTtlMs: number;
  maxTtlMs: number;
  maxFee: bigint;
}

/** Opaque application call prepared by a platform adapter. */
export interface SponsorshipTargetCall {
  readonly targetAddress: string;
  readonly targetEntryPoint: string;
}

export interface PrepareSponsorshipInput {
  target: SponsorshipTargetCall;
  expiresAt: Date;
  purchaseId?: Uint8Array;
}

export interface SponsorshipRequest {
  readonly transaction: Uint8Array;
  readonly purchaseId: Uint8Array;
  readonly targetAddress: string;
  readonly targetEntryPoint: string;
  readonly targetCommunicationCommitment: string;
}

export interface SponsorshipRequestInput {
  transaction: Uint8Array;
}

export interface SponsorshipInspection {
  readonly purchaseId: Uint8Array;
  readonly targetAddress: string;
  readonly targetEntryPoint: string;
  readonly targetCommunicationCommitment: string;
  readonly targetHasFallibleTranscript: boolean;
  readonly hasDust: boolean;
  readonly feeEstimate?: bigint;
}

export interface SponsorshipSubmission {
  readonly txId: string;
  readonly status: string;
  readonly feeEstimate: bigint;
  readonly purchaseId: Uint8Array;
  readonly targetAddress: string;
  readonly targetEntryPoint: string;
  readonly targetCommunicationCommitment: string;
}

export interface BeneficiarySponsorshipApi {
  prepare(input: PrepareSponsorshipInput): Promise<SponsorshipRequest>;
}

export interface SponsorSponsorshipApi {
  inspect(input: SponsorshipRequestInput): Promise<SponsorshipInspection>;
  sponsorAndSubmit(input: SponsorshipRequestInput): Promise<SponsorshipSubmission>;
}
