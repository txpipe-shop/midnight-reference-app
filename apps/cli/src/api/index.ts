import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import {
  CompactCompiledContract,
  configureProviders,
  exampleContractPrivateStateKey,
  type ContractAddress,
  type ContractType,
  type ExampleContractProviders,
  type PrivateState
} from "@midnight-reference-app/contract";
import type { WalletContext } from "@midnight-reference-app/wallet";
import assert from "node:assert";
import type { ExampleContractInstance } from "../../../../packages/contract/dist/types.js";
import type { StandaloneConfig } from "../config.js";

export class ExampleContract {
  private static instance: ExampleContract | null = null;

  readonly providers: ExampleContractProviders;
  readonly deployedContract: ExampleContractInstance | null = null;

  private constructor(
    providers: ExampleContractProviders,
    deployedContract: ExampleContractInstance
  ) {
    this.providers = providers;
    this.deployedContract = deployedContract;
  }

  static async deploy(
    walletCtx: WalletContext,
    config: StandaloneConfig,
    privateState: PrivateState
  ): Promise<ExampleContract> {
    if (ExampleContract.instance) return ExampleContract.instance;

    const providers = await configureProviders(walletCtx, {
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      proofServer: config.proofServer,
    });


    const deployedContract = await deployContract<ContractType>(providers, {
      compiledContract: CompactCompiledContract,
      privateStateId: exampleContractPrivateStateKey,
      initialPrivateState: privateState,
    });


    ExampleContract.instance = new ExampleContract(providers, deployedContract);
    return ExampleContract.instance;
  }

  static async join(
    walletCtx: WalletContext,
    config: StandaloneConfig,
    contractAddress: ContractAddress,
    privateState: PrivateState
  ): Promise<ExampleContract> {
    if (ExampleContract.instance) {
      return ExampleContract.instance;
    }

    const providers = await configureProviders(walletCtx, {
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      proofServer: config.proofServer,
    });

    const deployedContract = await findDeployedContract<ContractType>(
      providers,
      {
        contractAddress,
        compiledContract: CompactCompiledContract,
        privateStateId: exampleContractPrivateStateKey,
        initialPrivateState: privateState,
      }
    );

    ExampleContract.instance = new ExampleContract(providers, deployedContract);
    return ExampleContract.instance;
  }

  async returnTrue(): Promise<boolean> {
    assert(this.deployedContract !== null, "Contract not deployed");
    const result = await this.deployedContract.callTx.returnTrue();
    return result.private.result;
  }
}