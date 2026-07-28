import type { EligibilityQueueOperator } from '@midnight-sentinel/api/sponsorship/eligibility';
import type { SentinelContract } from '@midnight-sentinel/api';

export class ContractQueueOperator implements EligibilityQueueOperator {
  constructor(private readonly contract: SentinelContract) {}

  async lookup(identity: Uint8Array) {
    const state = await this.contract.readState();
    if (!state.delegatorPositions.member(identity)) return undefined;
    const slot = state.delegatorSlots.lookup(state.delegatorPositions.lookup(identity));
    return { enrollmentNonce: slot.enrollmentNonce };
  }

  add(input: Parameters<SentinelContract['addDelegator']>[0]) {
    return this.contract.addDelegator(input);
  }

  update(input: Parameters<SentinelContract['updateDelegator']>[0]) {
    return this.contract.updateDelegator(input);
  }

  remove(identity: Uint8Array) {
    return this.contract.removeDelegator(identity);
  }
}
