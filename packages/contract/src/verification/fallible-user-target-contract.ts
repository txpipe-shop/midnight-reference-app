import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Contract } from '../managed/fallible-user-target/contract/index.js';

export const FallibleUserTargetConstructor = Contract<undefined>;
export type FallibleUserTargetType = InstanceType<typeof FallibleUserTargetConstructor>;

export const FallibleUserTargetCompiledContract = CompiledContract.make<
  FallibleUserTargetType,
  undefined
>('FallibleUserTargetVerificationContract', FallibleUserTargetConstructor).pipe(
  CompiledContract.withWitnesses({} as never),
  CompiledContract.withCompiledFileAssets(
    /* @vite-ignore */
    new URL('../managed/fallible-user-target', import.meta.url).pathname
  )
);

export {
  ledger as fallibleUserTargetLedger,
  type Ledger as FallibleUserTargetLedger,
} from '../managed/fallible-user-target/contract/index.js';
