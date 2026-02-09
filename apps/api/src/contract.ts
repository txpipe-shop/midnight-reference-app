import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { deployContract, findDeployedContract, type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { CompactCompiledContract, Contract, createPrivateState, ledger, type PrivateState, type Witnesses } from "@midnight-reference-app/contract";
import { combineLatest, from, map, Observable, tap } from 'rxjs';
import { randomBytes } from './utils/helpers';
import { ContractDerivedState } from './utils/types';

export interface DeployedContract {
  readonly deployedContractAddress: ContractAddress,
  readonly state$: Observable<ContractDerivedState>

  returnTrue(): Promise<boolean>
}

type ExampleContractType = Contract<PrivateState, Witnesses<PrivateState>>
type DeployedExampleContract = FoundContract<ExampleContractType>

const exampleContractPrivateStateKey = 'exampleContractPrivateState';
type PrivateStateId = typeof exampleContractPrivateStateKey;

type ExampleContractCircuitKeys = Exclude<keyof ExampleContractType['impureCircuits'], number | symbol>;
export type ExampleContractProviders = MidnightProviders<ExampleContractCircuitKeys, PrivateStateId, PrivateState>

export class ExampleContract implements DeployedContract {
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<ContractDerivedState>;

  /** @internal */
  private constructor(
    public readonly deployedContract: DeployedExampleContract,
    providers: ExampleContractProviders
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    this.state$ = combineLatest(
      [
        // Combine public (ledger) state with...
        providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' }).pipe(
          map((contractState) => ledger(contractState.data)),
          tap((ledgerState) =>
            console.log('ledgerState', ledgerState),
          ),
        ),
        // ...private state...
        //    since the private state of the example contract never changes, we can query the
        //    private state once and always use the same value with `combineLatest`. In applications
        //    where the private state is expected to change, we would need to make this an `Observable`.
        from(providers.privateStateProvider.get(exampleContractPrivateStateKey) as Promise<PrivateState>),
      ],
      // ...and combine them to produce the required derived state.
      (ledgerState, _privateState) => {
        return {
          counter: ledgerState.counter,
        };
      },
    );
  }

  static async deploy(providers: ExampleContractProviders): Promise<ExampleContract> {
    console.log('Deploying example contract');
    const deployedContract = await deployContract(providers, {
      compiledContract: CompactCompiledContract,
      privateStateId: exampleContractPrivateStateKey,
      initialPrivateState: await this.getPrivateState(providers)
    })

    return new ExampleContract(deployedContract, providers);
  }

  static async join(providers: ExampleContractProviders, contractAddress: ContractAddress): Promise<ExampleContract> {
    const deployedContract = await findDeployedContract<ExampleContractType>(providers, {
      contractAddress,
      compiledContract: CompactCompiledContract,
      privateStateId: exampleContractPrivateStateKey,
      initialPrivateState: await this.getPrivateState(providers),
    });

    return new ExampleContract(deployedContract, providers);
  }

  async returnTrue(): Promise<boolean> {
    const response = await this.deployedContract.callTx.returnTrue();
    return response.private.result;
  }

  private static async getPrivateState(providers: ExampleContractProviders) {
    const existingPrivateState = await providers.privateStateProvider.get(exampleContractPrivateStateKey);
    return existingPrivateState ?? createPrivateState(randomBytes(32));
  }
}