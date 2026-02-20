import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
  type WalletContext,
  createWalletAndMidnightProvider,
} from "@midnight-reference-app/wallet";
import {
  ExampleContractCircuitKeys,
  exampleContractPrivateStateKey,
  ExampleContractProviders,
  PrivateStateId
} from "./types.js";

// TODO: Maybe we can improve how these variables are defined
export const contractConfig = {
  privateStateStoreName: exampleContractPrivateStateKey,
};

export const configureProviders = async (
  walletCtx: WalletContext,
  config: { indexer: string; indexerWS: string; proofServer: string },
  zkConfigPath: string
): Promise<ExampleContractProviders> => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(walletCtx);
  const zkConfigProvider = new NodeZkConfigProvider<ExampleContractCircuitKeys>(zkConfigPath);

  return {
    privateStateProvider: levelPrivateStateProvider<PrivateStateId>({
      privateStateStoreName: contractConfig.privateStateStoreName,
      walletProvider: walletAndMidnightProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(
      config.proofServer,
      zkConfigProvider
    ),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};
