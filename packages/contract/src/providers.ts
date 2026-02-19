import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
  type WalletContext,
  createWalletAndMidnightProvider,
} from "@midnight-reference-app/wallet";
import path from "node:path";
import {
  SentinelContractCircuitKeys,
  sentinelContractPrivateStateKey,
  SentinelContractProviders,
  PrivateStateId
} from "./types.js";

// TODO: Maybe we can improve how these variables are defined
const currentDir = path.resolve(new URL(import.meta.url).pathname, "..");
export const contractConfig = {
  privateStateStoreName: sentinelContractPrivateStateKey,
  zkConfigPath: path.resolve(currentDir, "managed", "sentinel"),
};

export const configureProviders = async (
  walletCtx: WalletContext,
  config: { indexer: string; indexerWS: string; proofServer: string }
): Promise<SentinelContractProviders> => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(walletCtx);
  const zkConfigProvider = new NodeZkConfigProvider<SentinelContractCircuitKeys>(contractConfig.zkConfigPath);

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
