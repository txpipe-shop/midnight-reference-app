import type {
  ContractAddress,
  ContractState,
} from "@midnight-ntwrk/compact-runtime";
import type { TransactionId, ZswapChainState } from "@midnight-ntwrk/ledger-v7";
import type {
  BlockHashConfig,
  BlockHeightConfig,
  ContractStateObservableConfig,
  FinalizedTxData,
  PublicDataProvider,
  UnshieldedBalances,
} from "@midnight-ntwrk/midnight-js-types";
import type { Observable } from "rxjs";
import { retryWithBackoff } from "./retryWithBackoff";

export type ProviderAction =
  | "balanceTxStarted"
  | "balanceTxDone"
  | "proveTxStarted"
  | "proveTxDone"
  | "downloadProverStarted"
  | "downloadProverDone"
  | "submitTxStarted"
  | "submitTxDone"
  | "watchForTxDataStarted"
  | "watchForTxDataDone";

export type ActionMessages = {
  [K in ProviderAction]: string | undefined;
};

export class WrappedPublicDataProvider implements PublicDataProvider {
  constructor(
    private readonly wrapped: PublicDataProvider,
  ) { }

  contractStateObservable(
    address: ContractAddress,
    config: ContractStateObservableConfig
  ): Observable<ContractState> {
    return this.wrapped.contractStateObservable(address, config);
  }

  queryContractState(
    contractAddress: ContractAddress,
    config?: BlockHeightConfig | BlockHashConfig
  ): Promise<ContractState | null> {
    return retryWithBackoff(
      () => this.wrapped.queryContractState(contractAddress, config),
      "queryContractState",
      1
    );
  }

  queryDeployContractState(
    contractAddress: ContractAddress
  ): Promise<ContractState | null> {
    return retryWithBackoff(
      () => this.wrapped.queryDeployContractState(contractAddress),
      "queryDeployContractState"
    );
  }

  queryZSwapAndContractState(
    contractAddress: ContractAddress,
    config?: BlockHeightConfig | BlockHashConfig
  ): Promise<[ZswapChainState, ContractState] | null> {
    return retryWithBackoff(
      () => this.wrapped.queryZSwapAndContractState(contractAddress, config),
      "queryZSwapAndContractState"
    );
  }

  queryUnshieldedBalances(
    contractAddress: ContractAddress,
    config?: BlockHeightConfig | BlockHashConfig
  ): Promise<UnshieldedBalances | null> {
    return retryWithBackoff(
      () => this.wrapped.queryUnshieldedBalances(contractAddress, config),
      "queryZSwapAndContractState"
    );
  }

  watchForContractState(
    contractAddress: ContractAddress
  ): Promise<ContractState> {
    return retryWithBackoff(
      () => this.wrapped.watchForContractState(contractAddress),
      "watchForContractState"
    );
  }

  watchForUnshieldedBalances(
    contractAddress: ContractAddress
  ): Promise<UnshieldedBalances> {
    return retryWithBackoff(
      () => this.wrapped.watchForUnshieldedBalances(contractAddress),
      "watchForContractState"
    );
  }

  watchForDeployTxData(
    contractAddress: ContractAddress
  ): Promise<FinalizedTxData> {
    return retryWithBackoff(
      () => this.wrapped.watchForDeployTxData(contractAddress),
      "watchForDeployTxData"
    );
  }

  watchForTxData(txId: TransactionId): Promise<FinalizedTxData> {
    // calling a callback is a workaround to show in the UI when the watchForTxData is called
    return retryWithBackoff(
      () => this.wrapped.watchForTxData(txId),
      "watchForTxDataStarted",

      1000 // we keep retrying long enough
    );
  }

  unshieldedBalancesObservable(
    address: ContractAddress,
    config: ContractStateObservableConfig
  ): Observable<UnshieldedBalances> {
    return this.wrapped.unshieldedBalancesObservable(address, config);
  }
}
