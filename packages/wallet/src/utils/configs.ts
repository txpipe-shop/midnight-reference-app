import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { Config } from './types.js';

export const buildInitConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  costParameters: {
    additionalFeeOverhead: 300_000_000_000_000n,
    feeBlocksMargin: 5,
  },
  indexerClientConnection: {
    indexerHttpUrl: indexer,
    indexerWsUrl: indexerWS,
  },
  provingServerUrl: new URL(proofServer),
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  relayURL: new URL(node.replace(/^http/, 'ws')),
});
