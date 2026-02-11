import { getNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { getUnshieldedSeed } from "@midnight-ntwrk/testkit-js";
import { type UtxoWithMeta as UtxoWithMetaDust } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { createKeystore, UnshieldedWalletState } from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { type Logger } from "pino";
import * as Rx from "rxjs";

export const generateDust = async (
  logger: Logger,
  walletSeed: string,
  unshieldedState: UnshieldedWalletState,
  walletFacade: WalletFacade,
) => {
  const ttlIn10min = new Date(Date.now() + 10 * 60 * 1000);
  const dustState = await walletFacade.dust.waitForSyncedState();
  const networkId = getNetworkId();
  const unshieldedKeystore = createKeystore(getUnshieldedSeed(walletSeed), networkId);
  const utxos: UtxoWithMetaDust[] = unshieldedState.availableCoins
    .filter((coin) => !coin.meta.registeredForDustGeneration)
    .map((utxo) => ({ ...utxo.utxo, ctime: new Date(utxo.meta.ctime) }));

  if (utxos.length === 0) {
    logger.info('No unregistered UTXOs found for dust generation.');
    return;
  }

  logger.info(`Generating dust with ${utxos.length} UTXOs...`);

  const registerForDustTransaction = await walletFacade.dust.createDustGenerationTransaction(
    new Date(),
    ttlIn10min,
    utxos,
    unshieldedKeystore.getPublicKey(),
    dustState.dustAddress,
  );

  const intent = registerForDustTransaction.intents?.get(1);
  const intentSignatureData = intent!.signatureData(1);
  const signature = unshieldedKeystore.signData(intentSignatureData);
  const recipe = await walletFacade.dust.addDustGenerationSignature(registerForDustTransaction, signature);

  const transaction = await walletFacade.finalizeTransaction(recipe);
  const txId = await walletFacade.submitTransaction(transaction);

  const dustBalance = await Rx.firstValueFrom(
    walletFacade.state().pipe(
      Rx.filter((s) => s.dust.walletBalance(new Date()) > 0n),
      Rx.map((s) => s.dust.walletBalance(new Date())),
    ),
  );
  logger.info(`Dust generation transaction submitted with txId: ${txId}`);
  logger.info(`Receiver dust balance after generation: ${dustBalance}`);

  return txId;
};
