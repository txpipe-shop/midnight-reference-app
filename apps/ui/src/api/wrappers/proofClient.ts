import type { UnprovenTransaction } from "@midnight-ntwrk/ledger-v7";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import type { ProofProvider, ProveTxConfig, UnboundTransaction, ZKConfigProvider } from "@midnight-ntwrk/midnight-js-types";

export const proofClient = <K extends string>(
  url: string,
  zkConfigProvider: ZKConfigProvider<K>,
): ProofProvider => {
  const httpClientProvider = httpClientProofProvider(url.trim(), zkConfigProvider);
  return {
    proveTx(
      tx: UnprovenTransaction,
      proveTxConfig?: ProveTxConfig
    ): Promise<UnboundTransaction> {
      return httpClientProvider.proveTx(tx, proveTxConfig);
    },
  };
};

export const noopProofClient = (): ProofProvider => {
  return {
    proveTx(): Promise<UnboundTransaction> {
      return Promise.reject(new Error("Proof server not available"));
    },
  };
};
