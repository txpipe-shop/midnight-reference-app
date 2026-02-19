import {
  deployContract,
  findDeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import {
  CompactCompiledContract,
  configureProviders,
  sentinelContractPrivateStateKey,
  type ContractAddress,
  type SentinelContractDeployed,
  type SentinelContractProviders,
  type SentinelContractType,
  type PrivateState,
} from "@midnight-sentinel/contract";
import type { WalletContext } from "@midnight-reference-app/wallet";
import assert from "assert";
import type { StandaloneConfig } from "../config.js";

export class SentinelContract {
  readonly providers: SentinelContractProviders;
  readonly deployedContract: SentinelContractDeployed | null;

  private constructor(
    providers: SentinelContractProviders,
    deployedContract: SentinelContractDeployed | null
  ) {
    this.providers = providers;
    this.deployedContract = deployedContract;
  }

  static async deploy(
    walletCtx: WalletContext,
    config: StandaloneConfig,
    privateState: PrivateState
  ): Promise<SentinelContract> {

    const providers = await configureProviders(walletCtx, {
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      proofServer: config.proofServer,
    });
    const deployedContract = await deployContract<SentinelContractType>(
      providers,
      {
        compiledContract: CompactCompiledContract,
        privateStateId: sentinelContractPrivateStateKey,
        initialPrivateState: privateState,
      }
    );

    return new SentinelContract(providers, deployedContract);
  }

  static async join(
    walletCtx: WalletContext,
    config: StandaloneConfig,
    contractAddress: ContractAddress,
    privateState: PrivateState
  ): Promise<SentinelContract> {
    const providers = await configureProviders(walletCtx, {
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      proofServer: config.proofServer,
    });
    const deployedContract = await findDeployedContract<SentinelContractType>(
      providers,
      {
        contractAddress,
        compiledContract: CompactCompiledContract,
        privateStateId: sentinelContractPrivateStateKey,
        initialPrivateState: privateState,
      }
    );

    return new SentinelContract(providers, deployedContract);
  }

  async returnTrue(): Promise<boolean> {
    assert(this.deployedContract, "Contract not deployed");
    const result = await this.deployedContract.callTx.returnTrue();
    return result.private.result;
  }
}
