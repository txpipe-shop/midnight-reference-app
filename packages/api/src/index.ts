import { fromHex } from '@midnight-ntwrk/compact-runtime';
import {
  QualifiedShieldedCoinInfo,
  decodeQualifiedShieldedCoinInfo,
} from '@midnight-ntwrk/ledger-v8';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import {
  CompactCompiledContract,
  Ledger,
  ledger,
  sentinelContractPrivateStateKey,
  type ContractAddress,
  type PrivateState,
  type SentinelContractDeployed,
  type SentinelContractProviders,
  type SentinelContractType,
} from '@midnight-sentinel/contract';
import { map, type Observable } from 'rxjs';

export interface Config {
  indexer: string;
  indexerWS: string;
  proofServer: string;
}

export interface SentinelDerivedState {
  // Shielded token storage (private tokens)
  shieldedVault: QualifiedShieldedCoinInfo;
  hasShieldedTokens: boolean;

  // Access control
  owner: Uint8Array;
  authorized: Set<Uint8Array>;

  // Statistics
  totalShieldedDeposits: bigint;
  totalShieldedWithdrawals: bigint;
  totalUnshieldedDeposits: bigint;
  totalUnshieldedWithdrawals: bigint;
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

  static async deploy(
    providers: SentinelContractProviders,
    privateState: PrivateState
  ): Promise<SentinelContract> {
    console.log("About to deploy")
    const deployedContract = await deployContract<SentinelContractType>(providers, {
      compiledContract: CompactCompiledContract,
      privateStateId: sentinelContractPrivateStateKey,
      initialPrivateState: privateState,
    });
    console.log("Deployed")

    const contractAddress = deployedContract.deployTxData.public.contractAddress;
    const state$ = providers.publicDataProvider
      .contractStateObservable(contractAddress, { type: 'latest' })
      .pipe(
        map((contractState): SentinelDerivedState => {
          const ledgerState = ledger(contractState.data);
          return {
            // shielded token storage
            shieldedVault: decodeQualifiedShieldedCoinInfo(ledgerState.shieldedVault),
            hasShieldedTokens: ledgerState.hasShieldedTokens,
            // access control
            owner: ledgerState.owner,
            authorized: new Set(ledgerState.authorized),
            // statistics
            totalShieldedDeposits: ledgerState.totalShieldedDeposits,
            totalShieldedWithdrawals: ledgerState.totalShieldedWithdrawals,
            totalUnshieldedDeposits: ledgerState.totalUnshieldedDeposits,
            totalUnshieldedWithdrawals: ledgerState.totalUnshieldedWithdrawals,
          };
        })
      );

    console.debug('Deployment fees: ', deployedContract.deployTxData.public.fees);
    return new SentinelContract(providers, deployedContract, state$);
  }

  static async join(
    providers: SentinelContractProviders,
    contractAddress: ContractAddress,
    privateState: PrivateState
  ): Promise<SentinelContract> {
    const deployedContract = await findDeployedContract<SentinelContractType>(providers, {
      contractAddress,
      compiledContract: CompactCompiledContract,
      privateStateId: sentinelContractPrivateStateKey,
      initialPrivateState: privateState,
    });

    const state$ = providers.publicDataProvider
      .contractStateObservable(contractAddress, { type: 'latest' })
      .pipe(
        map((contractState): SentinelDerivedState => {
          const ledgerState = ledger(contractState.data);
          return {
            // shielded token storage
            shieldedVault: decodeQualifiedShieldedCoinInfo(ledgerState.shieldedVault),
            hasShieldedTokens: ledgerState.hasShieldedTokens,
            // access control
            owner: ledgerState.owner,
            authorized: new Set(ledgerState.authorized),
            // statistics
            totalShieldedDeposits: ledgerState.totalShieldedDeposits,
            totalShieldedWithdrawals: ledgerState.totalShieldedWithdrawals,
            totalUnshieldedDeposits: ledgerState.totalUnshieldedDeposits,
            totalUnshieldedWithdrawals: ledgerState.totalUnshieldedWithdrawals,
          };
        })
      );

    return new SentinelContract(providers, deployedContract, state$);
  }

  async getCurrentState() {
    let subscription: { unsubscribe: () => void } | null = null;

    subscription = this.state$.subscribe(
      ({
        hasShieldedTokens,
        authorized,
        owner,
        shieldedVault,
        totalShieldedDeposits,
        totalShieldedWithdrawals,
        totalUnshieldedDeposits,
        totalUnshieldedWithdrawals,
      }) => {
        // Ensure we only handle the first emission
        subscription?.unsubscribe();

        console.dir({
          hasShieldedTokens,
          authorized: Array.from(authorized).map((a) => Buffer.from(a).toString('hex')),
          owner: Buffer.from(owner).toString('hex'),
          shieldedVault,
          totalShieldedDeposits,
          totalShieldedWithdrawals,
          totalUnshieldedDeposits,
          totalUnshieldedWithdrawals,
        }, { depth: null });
      }
    )
  }

  async mintFreeToken(recipientCoinPubKeyHex: string) {
    const domainSep = new Uint8Array(32).fill(1);
    const mintNonce = crypto.getRandomValues(new Uint8Array(32));
    const amount = 1000n;
    return await this.deployedContract?.callTx.mintDirectShielded(
      domainSep,
      amount,
      mintNonce,
      { bytes: fromHex(recipientCoinPubKeyHex) },
    );
  }
}
