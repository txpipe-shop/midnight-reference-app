import { ContractCall, PreProof } from '@midnight-ntwrk/ledger-v8';
import type { ZKConfigProvider } from '@midnight-ntwrk/midnight-js-types';
import type { SentinelContractProviders } from '@midnight-sentinel/contract';
import type { WalletContext } from '@midnight-sentinel/wallet';
import {
  dustPublicKeyToBytes,
  inspectSponsorshipRequest,
  nativeNightSponsorshipConfig,
  prepareSponsoredTransaction,
  sponsorAndSubmit,
  SponsorshipPolicyError,
  type PreparedTargetCall,
  type SponsorPolicy,
} from '../sponsorship.js';
import {
  SponsorshipError,
  type BeneficiarySponsorshipApi,
  type SponsorSponsorshipApi,
  type SponsorshipErrorCode,
  type SponsorshipInspection,
  type SponsorshipPolicy,
  type SponsorshipRequest,
  type SponsorshipStage,
  type SponsorshipSubmission,
  type SponsorshipTargetCall,
} from './index.js';

export { dustPublicKeyToBytes, nativeNightSponsorshipConfig };

interface MidnightTargetCallData {
  call: PreparedTargetCall;
  zkConfigProvider: ZKConfigProvider<string>;
}

const targetCalls = new WeakMap<SponsorshipTargetCall, MidnightTargetCallData>();
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const normalizeError = (
  error: unknown,
  stage: SponsorshipStage,
  fallbackCode: SponsorshipErrorCode
) => {
  if (error instanceof SponsorshipError) return error;
  if (error instanceof SponsorshipPolicyError) {
    return new SponsorshipError(error.code, error.message, { stage, cause: error });
  }
  return new SponsorshipError(fallbackCode, errorMessage(error), {
    stage,
    retryable:
      fallbackCode === 'PROOF_GENERATION_FAILED' ||
      fallbackCode === 'SUBMISSION_FAILED' ||
      fallbackCode === 'CONFIRMATION_FAILED',
    cause: error,
  });
};

const preparationCode = (error: unknown): SponsorshipErrorCode => {
  const value = errorMessage(error);
  if (value.includes('NO_ELIGIBLE_DELEGATOR')) return 'NO_ELIGIBLE_DELEGATOR';
  if (value.includes('reward') && value.includes('delivery')) {
    return 'REWARD_DELIVERY_FAILED';
  }
  if (value.includes('payment coin')) return 'PAYMENT_COIN_UNAVAILABLE';
  if (value.includes('paused')) return 'CAMPAIGN_PAUSED';
  if (value.includes('state not found')) return 'CAMPAIGN_UNAVAILABLE';
  if (value.includes('prove') || value.includes('proof')) {
    return 'PROOF_GENERATION_FAILED';
  }
  if (value.includes('balance') || value.includes('finalize')) {
    return 'BENEFICIARY_BALANCE_FAILED';
  }
  return 'TARGET_CALL_INVALID';
};

const normalizeSponsorError = (error: unknown) => {
  if (error instanceof SponsorshipError) return error;
  if (error instanceof SponsorshipPolicyError) {
    return normalizeError(error, 'inspection', 'INTERNAL_ERROR');
  }
  const value = errorMessage(error).toLowerCase();
  if (value.includes('submit') || value.includes('node')) {
    return normalizeError(error, 'submission', 'SUBMISSION_FAILED');
  }
  if (value.includes('indexer') || value.includes('watch') || value.includes('confirm')) {
    return normalizeError(error, 'confirmation', 'CONFIRMATION_FAILED');
  }
  return normalizeError(error, 'balancing', 'SPONSOR_BALANCE_FAILED');
};

export interface MidnightTargetCallInput {
  targetCall: PreparedTargetCall;
  zkConfigProvider: ZKConfigProvider<string>;
}

export const createMidnightSponsorshipTarget = (
  input: MidnightTargetCallInput
): SponsorshipTargetCall => {
  const calls = [...(input.targetCall.private.unprovenTx.intents?.values() ?? [])]
    .flatMap((intent) => intent.actions)
    .filter((action): action is ContractCall<PreProof> => action instanceof ContractCall);
  if (calls.length !== 1) {
    throw new SponsorshipError(
      'TARGET_CALL_INVALID',
      `Prepared target must contain exactly one contract call; received ${calls.length}`,
      { stage: 'preparation' }
    );
  }
  const call = calls[0];
  const target: SponsorshipTargetCall = Object.freeze({
    targetAddress: call.address,
    targetEntryPoint:
      typeof call.entryPoint === 'string'
        ? call.entryPoint
        : Buffer.from(call.entryPoint).toString('utf8'),
  });
  targetCalls.set(target, {
    call: input.targetCall,
    zkConfigProvider: input.zkConfigProvider,
  });
  return target;
};

export interface MidnightBeneficiarySponsorshipOptions {
  sentinelAddress: string;
  sentinelProviders: SentinelContractProviders;
  beneficiary: WalletContext;
  proofServer: string;
}

export const createMidnightBeneficiarySponsorshipApi = (
  options: MidnightBeneficiarySponsorshipOptions
): BeneficiarySponsorshipApi => ({
  async prepare(input): Promise<SponsorshipRequest> {
    const target = targetCalls.get(input.target);
    if (!target) {
      throw new SponsorshipError(
        'TARGET_CALL_INVALID',
        'Target call was not created by the Midnight sponsorship adapter',
        { stage: 'preparation' }
      );
    }
    try {
      const prepared = await prepareSponsoredTransaction({
        targetCall: target.call,
        targetZkConfigProvider: target.zkConfigProvider,
        sentinelProviders: options.sentinelProviders,
        sentinelAddress: options.sentinelAddress,
        beneficiary: options.beneficiary,
        proofServer: options.proofServer,
        ttl: input.expiresAt,
        purchaseId: input.purchaseId,
      });
      return {
        transaction: prepared.serializedTransaction,
        purchaseId: prepared.purchaseId,
        targetAddress: prepared.targetAddress,
        targetEntryPoint: prepared.targetEntryPoint,
        targetCommunicationCommitment: prepared.targetCommunicationCommitment,
      };
    } catch (error) {
      const code = preparationCode(error);
      throw normalizeError(error, 'preparation', code);
    }
  },
});

export interface MidnightSponsorSponsorshipOptions {
  policy: SponsorshipPolicy;
  sentinelProviders: SentinelContractProviders;
  sponsor: WalletContext;
}

export const createMidnightSponsorSponsorshipApi = (
  options: MidnightSponsorSponsorshipOptions
): SponsorSponsorshipApi => {
  const policy: SponsorPolicy = options.policy;
  return {
    async inspect({ transaction }): Promise<SponsorshipInspection> {
      try {
        const inspection = await inspectSponsorshipRequest(
          transaction,
          policy,
          options.sentinelProviders
        );
        return {
          purchaseId: inspection.purchaseId,
          targetAddress: inspection.targetAddress,
          targetEntryPoint: inspection.targetEntryPoint,
          targetCommunicationCommitment: inspection.targetCommunicationCommitment,
          targetHasFallibleTranscript: inspection.targetHasFallibleTranscript,
          hasDust: false,
          feeEstimate: inspection.feeEstimate,
        };
      } catch (error) {
        throw normalizeError(error, 'inspection', 'INTERNAL_ERROR');
      }
    },

    async sponsorAndSubmit({ transaction }): Promise<SponsorshipSubmission> {
      try {
        return await sponsorAndSubmit(
          transaction,
          policy,
          options.sentinelProviders,
          options.sponsor
        );
      } catch (error) {
        throw normalizeSponsorError(error);
      }
    },
  };
};
