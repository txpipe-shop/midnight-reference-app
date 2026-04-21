import {
  decodeQualifiedShieldedCoinInfo,
  QualifiedShieldedCoinInfo,
} from '@midnight-ntwrk/ledger-v8';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { MidnightBech32m, UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import {
  CompactCompiledContract,
  createPrivateState,
  Ledger,
  ledger,
  sentinelContractPrivateStateKey,
  type ContractAddress,
  type PrivateState,
  type SentinelContractDeployed,
  type SentinelContractProviders,
  type SentinelContractType,
} from '@midnight-sentinel/contract';
import { getNetworkId } from '@midnight-sentinel/wallet';
import { map, type Observable } from 'rxjs';

export const toHex = (arr: Uint8Array) =>
  '0x' +
  Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export interface Config {
  indexer: string;
  indexerWS: string;
  proofServer: string;
}

export interface SentinelDerivedState {
  owner: string;
  delegators: Ledger['delegators'];
  shieldedVault: QualifiedShieldedCoinInfo;
  rewardsVault: QualifiedShieldedCoinInfo;
  hasShielded: boolean;
  hasRewards: boolean;
}

export class SentinelContract {
  readonly providers: SentinelContractProviders;
  readonly deployedContract: SentinelContractDeployed | null;
  readonly state$: Observable<SentinelDerivedState>;

  private constructor(
    providers: SentinelContractProviders,
    deployedContract: SentinelContractDeployed | null,
    state$: Observable<SentinelDerivedState>
  ) {
    this.providers = providers;
    this.deployedContract = deployedContract;
    this.state$ = state$;
  }

  static async deploy(providers: SentinelContractProviders): Promise<SentinelContract> {
    const deployedContract = await deployContract<SentinelContractType>(providers, {
      compiledContract: CompactCompiledContract,
      privateStateId: sentinelContractPrivateStateKey,
      initialPrivateState: await this.getPrivateState(providers, ''),
    });

    const contractAddress = deployedContract.deployTxData.public.contractAddress;
    const state$ = providers.publicDataProvider
      .contractStateObservable(contractAddress, { type: 'latest' })
      .pipe(
        map((contractState) => {
          const ledgerState = ledger(contractState.data);
          return {
            owner: toHex(ledgerState.owner),
            delegators: ledgerState.delegators,
            shieldedVault: decodeQualifiedShieldedCoinInfo(ledgerState.shieldedVault),
            rewardsVault: decodeQualifiedShieldedCoinInfo(ledgerState.rewardsVault),
            hasShielded: ledgerState.hasShielded,
            hasRewards: ledgerState.hasRewards,
          };
        })
      );

    console.debug('Deployment fees: ', deployedContract.deployTxData.public.fees);
    return new SentinelContract(providers, deployedContract, state$);
  }

  static async join(
    providers: SentinelContractProviders,
    contractAddress: ContractAddress
  ): Promise<SentinelContract> {
    const deployedContract = await findDeployedContract<SentinelContractType>(providers, {
      contractAddress,
      compiledContract: CompactCompiledContract,
      privateStateId: sentinelContractPrivateStateKey,
      initialPrivateState: await this.getPrivateState(providers, contractAddress),
    });

    const state$ = providers.publicDataProvider
      .contractStateObservable(contractAddress, { type: 'latest' })
      .pipe(
        map((contractState) => {
          const ledgerState = ledger(contractState.data);
          return {
            owner: toHex(ledgerState.owner),
            delegators: ledgerState.delegators,
            shieldedVault: decodeQualifiedShieldedCoinInfo(ledgerState.shieldedVault),
            rewardsVault: decodeQualifiedShieldedCoinInfo(ledgerState.rewardsVault),
            hasShielded: ledgerState.hasShielded,
            hasRewards: ledgerState.hasRewards,
          };
        })
      );

    return new SentinelContract(providers, deployedContract, state$);
  }

  async getCurrentState() {
    let subscription: { unsubscribe: () => void } | null = null;

    subscription = this.state$.subscribe((state) => {
      // Ensure we only handle the first emission
      subscription?.unsubscribe();

      console.log('Owner: ', state.owner);
      console.log('Shielded vault: ', state.shieldedVault);
      console.log('Rewards vault: ', state.rewardsVault);
      if (state.delegators.isEmpty()) {
        console.log('No delegators found');
        return;
      }
      for (const item of state.delegators) {
        console.log(`Public Key: ${toHex(item[0])}, Amount delegated: ${item[1].valueOf()}`);
      }
    });
  }

  async delegate(key: string, value: bigint) {
    const tx = await this.deployedContract?.callTx.delegate({
      nonce: new Uint8Array(32).fill(0),
      color: new Uint8Array(32).fill(0),
      value,
    });
    console.log(`Sent ${value} NIGHTs on tx: ${tx?.public.txHash}`);
  }

  async withdraw(addressString: string) {
    const parsed = MidnightBech32m.parse(addressString);
    const address = UnshieldedAddress.codec.decode(getNetworkId(), parsed);
    const tx = await this.deployedContract?.callTx.withdraw({ bytes: address.data });

    console.log(`Withdrew ${tx?.private.newCoins[0].value} NIGHTs on tx: ${tx?.public.txHash}`);
  }

  private static async getPrivateState(
    providers: SentinelContractProviders,
    contractAddress: string
  ): Promise<PrivateState> {
    providers.privateStateProvider.setContractAddress(contractAddress);
    const existingPrivateState = await providers.privateStateProvider.get(
      sentinelContractPrivateStateKey
    );
    return existingPrivateState ?? createPrivateState(crypto.getRandomValues(new Uint8Array(32)));
  }
}
