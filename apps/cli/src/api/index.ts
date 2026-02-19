import {
  deployContract,
  findDeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import {
  CompactCompiledContract,
  configureProviders,
  sentinelContractPrivateStateKey,
  SentinelEqOp,
  SentinelOrdOp,
  type ContractAddress,
  type SentinelContractDeployed,
  type SentinelContractProviders,
  type SentinelContractType,
  type SentinelRules,
  type PrivateState,
} from "@midnight-sentinel/contract";
import type { WalletContext } from "@midnight-reference-app/wallet";
import type { StandaloneConfig } from "../config.js";

export class SentinelContract {
  readonly providers: SentinelContractProviders;
  readonly deployedContract: SentinelContractDeployed | null;

  private constructor(
    providers: SentinelContractProviders,
    deployedContract: SentinelContractDeployed | null,
  ) {
    this.providers = providers;
    this.deployedContract = deployedContract;
  }

  static async deploy(
    walletCtx: WalletContext,
    config: StandaloneConfig,
    privateState: PrivateState,
  ): Promise<SentinelContract> {
    const providers = await configureProviders(walletCtx, {
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      proofServer: config.proofServer,
    });

    const args: SentinelRules = [
      {
        is_some: true,
        value: [
          {
            is_some: true,
            value: {
              is_left: true,
              left: {
                op: SentinelOrdOp.EQ,
                value: 123n,
              },
              right: {
                is_left: false,
                right: {
                  is_left: false,
                  left: {
                    op: SentinelEqOp.EQ,
                    value: new Uint8Array(32).fill(0),
                  },
                  right: {
                    right: {
                      op: SentinelEqOp.EQ,
                      nullifier: new Uint8Array(32).fill(0),
                    },
                    is_left: false,
                    left: {
                      op: SentinelEqOp.EQ,
                      value: 1n,
                    },
                  },
                },
                left: {
                  value: true,
                  op: SentinelEqOp.EQ,
                },
              },
            },
          },
        ],
      },
      {
        is_some: true,
        value: [
          {
            is_some: true,
            value: {
              is_left: true,
              left: {
                op: SentinelOrdOp.EQ,
                value: 123n,
              },
              right: {
                is_left: false,
                right: {
                  is_left: false,
                  left: {
                    op: SentinelEqOp.EQ,
                    value: new Uint8Array(32).fill(0),
                  },
                  right: {
                    right: {
                      op: SentinelEqOp.EQ,
                      nullifier: new Uint8Array(32).fill(0),
                    },
                    is_left: false,
                    left: {
                      op: SentinelEqOp.EQ,
                      value: 1n,
                    },
                  },
                },
                left: {
                  value: true,
                  op: SentinelEqOp.EQ,
                },
              },
            },
          },
        ],
      },
    ];

    const deployedContract = await deployContract<SentinelContractType>(
      providers,
      {
        compiledContract: CompactCompiledContract,
        privateStateId: sentinelContractPrivateStateKey,
        initialPrivateState: privateState,
        args: [args],
      },
    );

    console.dir(
      {
        publicInfo: deployedContract.deployTxData.public,
        privateInfo: deployedContract.deployTxData.private,
      },
      { depth: null },
    );
    return new SentinelContract(providers, deployedContract);
  }

  static async join(
    walletCtx: WalletContext,
    config: StandaloneConfig,
    contractAddress: ContractAddress,
    privateState: PrivateState,
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
      },
    );

    return new SentinelContract(providers, deployedContract);
  }
}
