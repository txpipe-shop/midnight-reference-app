import type { Contract as CompactContract } from '@midnight-ntwrk/compact-js';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import type { ContractProviders } from '@midnight-ntwrk/midnight-js-contracts';
import { type WalletContext, createWalletAndMidnightProvider } from '@midnight-sentinel/wallet';
import path from 'node:path';
import type { PrivateStateId, SentinelContractType } from './types.js';

export { NodeZkConfigProvider };

// TODO: Maybe we can improve how these variables are defined
const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const contractConfig = {
  zkConfigPath: path.resolve(currentDir, 'managed', 'sentinel'),
};

export const configureProviders = async <C extends CompactContract.Any = SentinelContractType>(
  walletCtx: WalletContext,
  config: { indexer: string; indexerWS: string; proofServer: string },
  privateStateStoreName: string,
  zkConfigPath = contractConfig.zkConfigPath
): Promise<ContractProviders<C>> => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(walletCtx);
  const zkConfigProvider = new NodeZkConfigProvider<CompactContract.ProvableCircuitId<C>>(
    zkConfigPath
  );
  return {
    privateStateProvider: levelPrivateStateProvider<
      PrivateStateId,
      CompactContract.PrivateState<C>
    >({
      privateStateStoreName: privateStateStoreName + '-midnight',
      privateStoragePasswordProvider: function (): string | Promise<string> {
        return 'MyM1dnightPassword!';
      },
      accountId: walletCtx.shieldedSecretKeys.coinPublicKey,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};
