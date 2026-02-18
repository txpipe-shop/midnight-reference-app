import {
  deployContract,
  findDeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import {
  CompactCompiledContract,
  configureProviders,
  exampleContractPrivateStateKey,
  pureCircuits,
  type ContractAddress,
  type ExampleContractDeployed,
  type ExampleContractProviders,
  type ExampleContractType,
  type PrivateState,
} from "@midnight-reference-app/contract";
import type { WalletContext } from "@midnight-reference-app/wallet";
import assert from "assert";
import type { StandaloneConfig } from "../config.js";

export class ExampleContract {
  readonly providers: ExampleContractProviders;
  readonly deployedContract: ExampleContractDeployed | null;

  private constructor(
    providers: ExampleContractProviders,
    deployedContract: ExampleContractDeployed | null
  ) {
    this.providers = providers;
    this.deployedContract = deployedContract;
  }

  static async deploy(
    walletCtx: WalletContext,
    config: StandaloneConfig,
    privateState: PrivateState
  ): Promise<ExampleContract> {

    const providers = await configureProviders(walletCtx, {
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      proofServer: config.proofServer,
    });
    const deployedContract = await deployContract<ExampleContractType>(
      providers,
      {
        compiledContract: CompactCompiledContract,
        privateStateId: exampleContractPrivateStateKey,
        initialPrivateState: privateState,
      }
    );

    return new ExampleContract(providers, deployedContract);
  }

  static async join(
    walletCtx: WalletContext,
    config: StandaloneConfig,
    contractAddress: ContractAddress,
    privateState: PrivateState
  ): Promise<ExampleContract> {
    const providers = await configureProviders(walletCtx, {
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      proofServer: config.proofServer,
    });
    const deployedContract = await findDeployedContract<ExampleContractType>(
      providers,
      {
        contractAddress,
        compiledContract: CompactCompiledContract,
        privateStateId: exampleContractPrivateStateKey,
        initialPrivateState: privateState,
      }
    );

    return new ExampleContract(providers, deployedContract);
  }

  async returnTrue(): Promise<boolean> {
    assert(this.deployedContract, "Contract not deployed");
    const result = await this.deployedContract.callTx.returnTrue();
    return result.private.result;
  }

  publicKey(secretKey: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
    return pureCircuits.publicKey(secretKey);
  }
}
