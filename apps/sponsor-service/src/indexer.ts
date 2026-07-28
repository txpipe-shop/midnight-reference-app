import {
  Binding,
  Proof,
  SignatureEnabled,
  Transaction,
  unshieldedToken,
} from '@midnight-ntwrk/ledger-v8';
import type { DustGenerationStatus } from '@midnight-sentinel/api/sponsorship/eligibility';
import { createClient, type Client } from 'graphql-ws';
import WebSocket from 'ws';
import { EligibilityDatabase } from './database.js';

const normalizeHex = (value: string) => value.toLowerCase().replace(/^0x/, '');
const utxoKey = (utxo: IndexerUtxo) => `${normalizeHex(utxo.intentHash)}:${utxo.outputIndex}`;

interface IndexerUtxo {
  tokenType: string;
  value: string;
  outputIndex: number;
  intentHash: string;
  registeredForDustGeneration: boolean;
}

interface TransactionEvent {
  type: 'UnshieldedTransaction';
  transaction: {
    id: number;
    raw: string;
    block: { height: number };
  };
  createdUtxos: IndexerUtxo[];
  spentUtxos: IndexerUtxo[];
}

interface ProgressEvent {
  type: 'UnshieldedTransactionsProgress';
  highestTransactionId: number;
}

type StreamEvent = TransactionEvent | ProgressEvent;

const subscription = `
  subscription SentinelUnshieldedTransactions(
    $address: UnshieldedAddress!,
    $transactionId: Int
  ) {
    unshieldedTransactions(address: $address, transactionId: $transactionId) {
      ... on UnshieldedTransaction {
        type: __typename
        transaction {
          id
          raw
          block { height }
        }
        createdUtxos {
          tokenType
          value
          outputIndex
          intentHash
          registeredForDustGeneration
        }
        spentUtxos {
          tokenType
          value
          outputIndex
          intentHash
          registeredForDustGeneration
        }
      }
      ... on UnshieldedTransactionsProgress {
        type: __typename
        highestTransactionId
      }
    }
  }
`;

const latestBlockQuery = `query SentinelLatestBlock { block { height } }`;

const registrationTarget = (raw: string, verificationKey: string): string | undefined => {
  const tx = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
    'signature',
    'proof',
    'binding',
    Uint8Array.from(Buffer.from(normalizeHex(raw), 'hex'))
  );
  for (const intent of tx.intents?.values() ?? []) {
    const registration = intent.dustActions?.registrations.find(
      (value) => value.nightKey === verificationKey
    );
    if (registration) {
      return registration.dustAddress?.toString();
    }
  }
  return undefined;
};

export class MidnightIndexerScanner {
  private readonly client: Client;

  constructor(
    private readonly httpUrl: string,
    wsUrl: string,
    private readonly database: EligibilityDatabase,
    private readonly sponsorDustKey: string
  ) {
    this.client = createClient({
      url: wsUrl,
      webSocketImpl: WebSocket,
      lazy: true,
      retryAttempts: 5,
    });
  }

  async latestFinalizedBlock(): Promise<bigint> {
    const response = await fetch(this.httpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: latestBlockQuery }),
    });
    if (!response.ok) {
      throw new Error(`Indexer returned HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      data?: { block?: { height: number } };
      errors?: { message: string }[];
    };
    if (!payload.data?.block) {
      throw new Error(payload.errors?.[0]?.message ?? 'Indexer returned no block');
    }
    return BigInt(payload.data.block.height);
  }

  async sync(input: {
    address: string;
    verificationKey: string;
    sponsorDustAddress: string;
  }): Promise<DustGenerationStatus> {
    this.database.markCursorUnsynchronized(input.address);
    const cursor = this.database.getCursor(input.address)?.transactionId;
    const progress = await new Promise<number>((resolve, reject) => {
      let settled = false;
      let progressSeen = false;
      let highestTransactionId = cursor ?? 0;
      let settleTimer: NodeJS.Timeout | undefined;
      const settleAfterBufferedEvents = (dispose: () => void) => {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          settled = true;
          dispose();
          resolve(highestTransactionId);
        }, 1_000);
      };
      const dispose = this.client.subscribe<{
        unshieldedTransactions: StreamEvent;
      }>(
        {
          query: subscription,
          variables: {
            address: input.address,
            transactionId: cursor,
          },
        },
        {
          next: ({ data, errors }) => {
            if (errors?.length) {
              settled = true;
              dispose();
              reject(new Error(errors[0]?.message ?? 'Indexer subscription failed'));
              return;
            }
            const event = data?.unshieldedTransactions;
            if (!event) return;
            if (event.type === 'UnshieldedTransactionsProgress') {
              // The indexer may emit the progress watermark immediately before
              // the final buffered transaction at that same watermark. Keep
              // the subscription open until the address stream is quiet so
              // that transaction is applied before persisting the cursor.
              progressSeen = true;
              highestTransactionId = Math.max(highestTransactionId, event.highestTransactionId);
              settleAfterBufferedEvents(dispose);
              return;
            }
            try {
              this.applyTransaction(input.address, input.verificationKey, event);
              highestTransactionId = Math.max(highestTransactionId, event.transaction.id);
              if (progressSeen) settleAfterBufferedEvents(dispose);
            } catch (error) {
              settled = true;
              if (settleTimer) clearTimeout(settleTimer);
              dispose();
              reject(error);
            }
          },
          error: (error) => {
            if (!settled) {
              settled = true;
              if (settleTimer) clearTimeout(settleTimer);
              reject(error);
            }
          },
          complete: () => {
            if (!settled) {
              settled = true;
              if (settleTimer) clearTimeout(settleTimer);
              if (progressSeen) resolve(highestTransactionId);
              else reject(new Error('Indexer subscription completed before progress'));
            }
          },
        }
      );
    });
    const finalizedBlock = await this.latestFinalizedBlock();
    this.database.setCursor(input.address, progress, finalizedBlock);
    const nightBalance = this.database.qualifyingBalance(
      input.address,
      unshieldedToken().raw,
      this.sponsorDustKey
    );
    return {
      nightRewardAddress: input.address,
      dustAddress: nightBalance > 0n ? input.sponsorDustAddress : undefined,
      registered: nightBalance > 0n,
      nightBalance,
      finalizedBlock,
      synchronized: true,
    };
  }

  private applyTransaction(address: string, verificationKey: string, event: TransactionEvent) {
    // Registration updates preserve the original NIGHT UTXO identity. The
    // createdUtxo.intentHash therefore points to the funding transaction, not
    // the registration intent. Correlate by the address-scoped transaction and
    // its matching NIGHT verification key instead of joining intent hashes.
    const dustKey = registrationTarget(event.transaction.raw, verificationKey);
    this.database.transaction(() => {
      this.database.applyUtxoChanges(
        address,
        event.spentUtxos.map(utxoKey),
        event.createdUtxos.map((utxo) => ({
          key: utxoKey(utxo),
          tokenType: normalizeHex(utxo.tokenType),
          value: BigInt(utxo.value),
          registered: utxo.registeredForDustGeneration,
          dustKey: utxo.registeredForDustGeneration ? dustKey : undefined,
        }))
      );
    });
  }

  async dispose() {
    await Promise.resolve(this.client.dispose()).catch(() => undefined);
  }
}

export const decodeDustAddressKey = async (network: string, address: string): Promise<string> => {
  const { DustAddress, MidnightBech32m } =
    await import('@midnight-ntwrk/wallet-sdk-address-format');
  return DustAddress.codec.decode(network, MidnightBech32m.parse(address)).data.toString();
};
