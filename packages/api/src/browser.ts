import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { PrivateState, SentinelContractCircuitKeys, SentinelContractProviders } from "@midnight-sentinel/contract";
import { inMemoryPrivateStateProvider } from "./in-memory-private-state-provider.js";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { Binding, FinalizedTransaction, Proof, Transaction, TransactionId, Intent, PreBinding, Proofish } from "@midnight-ntwrk/ledger-v7";
import { fromHex, toHex } from "@midnight-ntwrk/compact-runtime";
import { SignatureEnabled } from "@midnight-ntwrk/ledger-v7";
import { UnboundTransaction } from "@midnight-ntwrk/midnight-js-types";
import { type ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';

export const initializeProviders = async (connectedAPI: ConnectedAPI): Promise<SentinelContractProviders> => {
  const zkConfigPath = `${window.location.origin}/managed/sentinel`;
  const keyMaterialProvider = new FetchZkConfigProvider<SentinelContractCircuitKeys>(zkConfigPath, fetch.bind(window));
  const config = await connectedAPI.getConfiguration();
  const inMemoryBBoardPrivateStateProvider = inMemoryPrivateStateProvider<string, PrivateState>();
  const shieldedAddresses = await connectedAPI.getShieldedAddresses();
  return {
    privateStateProvider: inMemoryBBoardPrivateStateProvider,
    zkConfigProvider: keyMaterialProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri!, keyMaterialProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey(): string {
        return shieldedAddresses.shieldedCoinPublicKey;
      },
      getEncryptionPublicKey(): string {
        return shieldedAddresses.shieldedEncryptionPublicKey;
      },
      balanceTx: async (tx: UnboundTransaction, ttl?: Date): Promise<FinalizedTransaction> => {
        try {
          console.info({ tx, ttl }, 'Balancing transaction via wallet');
          const serializedTx = toHex(tx.serialize());
          const received = await connectedAPI.balanceUnsealedTransaction(serializedTx);
          return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
            'signature',
            'proof',
            'binding',
            fromHex(received.tx),
          );
        } catch (e) {
          console.error({ error: e }, 'Error balancing transaction via wallet');
          throw e;
        }
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await connectedAPI.submitTransaction(toHex(tx.serialize()));
        const txIdentifiers = tx.identifiers();
        const txId = txIdentifiers[0]; // Return the first transaction ID
        console.info({ txIdentifiers }, 'Submitted transaction via wallet');
        return txId;
      },
    },
  };
};
