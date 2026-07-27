import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import {
  ZKConfigProvider,
  type ProverKey,
  type VerifierKey,
  type ZKIR,
} from '@midnight-ntwrk/midnight-js-types';
import { Contract as SponsorshipContract } from './managed/composite-sponsorship/contract/index.js';
import { Contract as TargetContract } from './managed/composite-target/contract/index.js';

export const CompositeSponsorshipContractConstructor = SponsorshipContract<undefined>;
export type CompositeSponsorshipContractType = InstanceType<
  typeof CompositeSponsorshipContractConstructor
>;

export const CompositeTargetContractConstructor = TargetContract<undefined>;
export type CompositeTargetContractType = InstanceType<typeof CompositeTargetContractConstructor>;

class CompositeZkConfigProvider extends ZKConfigProvider<string> {
  readonly sponsorship: NodeZkConfigProvider<string>;
  readonly target: NodeZkConfigProvider<string>;

  constructor(sponsorshipPath: string, targetPath: string) {
    super();
    this.sponsorship = new NodeZkConfigProvider<string>(sponsorshipPath);
    this.target = new NodeZkConfigProvider<string>(targetPath);
  }

  private provider(circuitId: string) {
    if (circuitId === 'purchaseSponsorship') return this.sponsorship;
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

export const compositeProofProvider = (
  proofServer: string,
  sponsorshipPath: string,
  targetPath: string
) =>
  httpClientProofProvider(proofServer, new CompositeZkConfigProvider(sponsorshipPath, targetPath));

export const CompositeSponsorshipCompiledContract = CompiledContract.make<
  CompositeSponsorshipContractType,
  undefined
>('CompositeSponsorshipVerificationContract', CompositeSponsorshipContractConstructor).pipe(
  CompiledContract.withWitnesses({} as never),
  CompiledContract.withCompiledFileAssets(
    /* @vite-ignore */
    new URL('./managed/composite-sponsorship', import.meta.url).pathname
  )
);

export const CompositeTargetCompiledContract = CompiledContract.make<
  CompositeTargetContractType,
  undefined
>('CompositeTargetVerificationContract', CompositeTargetContractConstructor).pipe(
  CompiledContract.withWitnesses({} as never),
  CompiledContract.withCompiledFileAssets(
    /* @vite-ignore */
    new URL('./managed/composite-target', import.meta.url).pathname
  )
);

export {
  ledger as compositeSponsorshipLedger,
  type Ledger as CompositeSponsorshipLedger,
} from './managed/composite-sponsorship/contract/index.js';

export {
  ledger as compositeTargetLedger,
  type Ledger as CompositeTargetLedger,
} from './managed/composite-target/contract/index.js';
