import { fromHex, toHex } from "@midnight-ntwrk/compact-runtime";
import * as ledger from "@midnight-ntwrk/ledger-v7";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import type { MidnightProvider, PrivateStateProvider, ProofProvider, PublicDataProvider, UnboundTransaction, WalletProvider, ZKConfigProvider } from "@midnight-ntwrk/midnight-js-types";
import type { ExampleContractCircuitKeys, exampleContractPrivateStateKey, ExampleContractProviders, PrivateState } from "@midnight-reference-app/contract";
import { createContext, useMemo, type ReactNode } from "react";
import { inMemoryPrivateStateProvider } from "../api/inMemoryPrivateStateProvider";
import { noopProofClient, proofClient } from "../api/wrappers/proofClient";
import { WrappedPublicDataProvider } from "../api/wrappers/publicDataProvider";
import { CachedFetchZkConfigProvider } from "../api/wrappers/zkConfigProvider";
import { useWallet } from "../hooks/useWallet";

interface ProviderProps { children: ReactNode; }
export interface ProvidersState {
  privateStateProvider: PrivateStateProvider<string>;
  zkConfigProvider?: ZKConfigProvider<ExampleContractCircuitKeys>;
  proofProvider: ProofProvider;
  publicDataProvider?: PublicDataProvider;
  walletProvider?: WalletProvider;
  midnightProvider?: MidnightProvider;
  providers?: ExampleContractProviders;
}

export const ProvidersContext = createContext<ProvidersState | undefined>(undefined);

export const ProvidersProvider = ({ children }: ProviderProps) => {
  const { serviceUriConfig, connectedAPI, status, shieldedAddresses } = useWallet()

  const privateStateProvider: PrivateStateProvider<
    typeof exampleContractPrivateStateKey
  > = useMemo(
    () =>
      inMemoryPrivateStateProvider<string, PrivateState>(),
    [status]
  );

  const publicDataProvider: PublicDataProvider | undefined = useMemo(
    () =>
      serviceUriConfig
        ? new WrappedPublicDataProvider(
          indexerPublicDataProvider(
            serviceUriConfig.indexerUri,
            serviceUriConfig.indexerWsUri
          ),
        )
        : undefined,
    [serviceUriConfig, status]
  );

  const zkConfigProvider = useMemo(() => {
    if (typeof window === "undefined") {
      // Return undefined (or an appropriate fallback) if running on the server.
      return undefined;
    }
    return new CachedFetchZkConfigProvider<ExampleContractCircuitKeys>(
      `${window.location.origin}/midnight/counter`,
      fetch.bind(window),
    );
  }, [status]);

  const proofProvider = useMemo(
    () =>
      serviceUriConfig?.proverServerUri && zkConfigProvider
        ? proofClient(serviceUriConfig.proverServerUri, zkConfigProvider)
        : noopProofClient(),
    [serviceUriConfig, zkConfigProvider, status]
  );

  const walletProvider: WalletProvider = useMemo(
    () =>
      connectedAPI
        ? {
          getCoinPublicKey(): ledger.CoinPublicKey {
            return shieldedAddresses?.shieldedCoinPublicKey as unknown as ledger.CoinPublicKey;
          },
          getEncryptionPublicKey(): ledger.EncPublicKey {
            return shieldedAddresses?.shieldedEncryptionPublicKey as unknown as ledger.EncPublicKey;
          },
          async balanceTx(
            tx: UnboundTransaction,
            ttl?: Date
          ): Promise<ledger.FinalizedTransaction> {
            try {
              const serializedTx = toHex(tx.serialize());
              const received =
                await connectedAPI.balanceUnsealedTransaction(serializedTx);
              return ledger.Transaction.deserialize<
                ledger.SignatureEnabled,
                ledger.Proof,
                ledger.Binding
              >(
                "signature",
                "proof",
                "binding",
                fromHex(received.tx)
              );
            } catch (e) {
              throw e;
            }
          },
        }
        : {
          getCoinPublicKey(): ledger.CoinPublicKey {
            return "";
          },
          getEncryptionPublicKey(): ledger.EncPublicKey {
            return "";
          },
          balanceTx: () => Promise.reject(new Error("readonly")),
        },
    [connectedAPI, status]
  );

  const midnightProvider: MidnightProvider = useMemo(
    () =>
      connectedAPI
        ? {
          submitTx: async (
            tx: ledger.FinalizedTransaction
          ): Promise<ledger.TransactionId> => {
            await connectedAPI.submitTransaction(toHex(tx.serialize()));
            const txIdentifiers = tx.identifiers();
            const txId = txIdentifiers[0]; // Return the first transaction ID
            return txId;
          },
        }
        : {
          submitTx: (): Promise<ledger.TransactionId> =>
            Promise.reject(new Error("readonly")),
        },
    [connectedAPI, status]
  );

  const combinedProviders: ProvidersState = useMemo(() => {
    return {
      privateStateProvider,
      publicDataProvider,
      proofProvider,
      zkConfigProvider,
      walletProvider,
      midnightProvider,
      providers:
        publicDataProvider && zkConfigProvider
          ? {
            privateStateProvider,
            publicDataProvider,
            zkConfigProvider,
            proofProvider,
            walletProvider,
            midnightProvider,
          }
          : undefined,
    };
  }, [
    privateStateProvider,
    publicDataProvider,
    proofProvider,
    zkConfigProvider,
    walletProvider,
    midnightProvider,
  ]);

  return (
    <ProvidersContext.Provider value={combinedProviders}> {children} </ProvidersContext.Provider>
  );
};