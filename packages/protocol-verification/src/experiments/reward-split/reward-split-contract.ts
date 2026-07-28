import { CompiledContract } from '@midnight-ntwrk/compact-js';
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import {
  ZKConfigProvider,
  type ProverKey,
  type VerifierKey,
  type ZKIR,
} from '@midnight-ntwrk/midnight-js-types';
import type { PrivateState } from '@midnight-sentinel/contract';
import {
  Contract,
  type Ledger,
  type Witnesses,
} from '../../managed/reward-split/contract/index.js';

const rewardSplitWitnesses: Witnesses<PrivateState> = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, PrivateState>): [PrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
};

export const RewardSplitContractConstructor = Contract<PrivateState>;
export type RewardSplitContractType = InstanceType<typeof RewardSplitContractConstructor>;

export const RewardSplitCompiledContract = CompiledContract.make<
  RewardSplitContractType,
  PrivateState
>('RewardSplitVerificationContract', RewardSplitContractConstructor).pipe(
  CompiledContract.withWitnesses(rewardSplitWitnesses),
  CompiledContract.withCompiledFileAssets(
    /* @vite-ignore */
    new URL('../../managed/reward-split', import.meta.url).pathname
  )
);

class RewardSplitCompositeZkConfigProvider extends ZKConfigProvider<string> {
  readonly rewardSplit: NodeZkConfigProvider<string>;
  readonly target: NodeZkConfigProvider<string>;

  constructor(rewardSplitPath: string, targetPath: string) {
    super();
    this.rewardSplit = new NodeZkConfigProvider<string>(rewardSplitPath);
    this.target = new NodeZkConfigProvider<string>(targetPath);
  }

  private provider(circuitId: string) {
    if (circuitId === 'purchaseDelegatorReward' || circuitId === 'deliverSponsorReward') {
      return this.rewardSplit;
    }
    if (circuitId === 'interact') return this.target;
    throw new Error(`Unexpected circuit ID: ${circuitId}`);
  }

  getProverKey(circuitId: string): Promise<ProverKey> {
    return this.provider(circuitId).getProverKey(circuitId);
  }

  getVerifierKey(circuitId: string): Promise<VerifierKey> {
    return this.provider(circuitId).getVerifierKey(circuitId);
  }

  getZKIR(circuitId: string): Promise<ZKIR> {
    return this.provider(circuitId).getZKIR(circuitId);
  }
}

export const rewardSplitCompositeProofProvider = (
  proofServer: string,
  rewardSplitPath: string,
  targetPath: string
) =>
  httpClientProofProvider(
    proofServer,
    new RewardSplitCompositeZkConfigProvider(rewardSplitPath, targetPath)
  );

export {
  ledger as rewardSplitLedger,
  type Ledger as RewardSplitLedger,
} from '../../managed/reward-split/contract/index.js';
