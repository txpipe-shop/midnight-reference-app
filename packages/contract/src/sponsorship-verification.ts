import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Contract } from './managed/sponsorship/contract/index.js';

export const SponsorshipContractConstructor = Contract<undefined>;
export type SponsorshipContractType = InstanceType<typeof SponsorshipContractConstructor>;

export const SponsorshipCompiledContract = CompiledContract.make<
  SponsorshipContractType,
  undefined
>('SponsorshipVerificationContract', SponsorshipContractConstructor).pipe(
  CompiledContract.withWitnesses({} as never),
  CompiledContract.withCompiledFileAssets(
    /* @vite-ignore */
    new URL('./managed/sponsorship', import.meta.url).pathname
  )
);

export {
  ledger as sponsorshipLedger,
  type Ledger as SponsorshipLedger,
} from './managed/sponsorship/contract/index.js';
