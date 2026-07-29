import type { Contract as CompactContract } from '@midnight-ntwrk/compact-js';
import type { ContractProviders } from '@midnight-ntwrk/midnight-js-contracts';
import {
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import { configureProviders } from '@midnight-sentinel/contract/providers';
import type { WalletContext } from '@midnight-sentinel/wallet';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as Rx from 'rxjs';

type NetworkConfig = {
  indexer: string;
  indexerWS: string;
  proofServer: string;
};

export const withTimeout = async <T>(
  label: string,
  timeoutMs: number,
  promise: Promise<T>
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const waitForWalletState = <T>(
  label: string,
  timeoutMs: number,
  wallet: WalletContext,
  select: (state: WalletState) => T | false
): Promise<T> =>
  withTimeout(
    label,
    timeoutMs,
    Rx.firstValueFrom(
      wallet.wallet.state().pipe(
        Rx.filter((state) => state.isSynced),
        Rx.map(select),
        Rx.filter((value): value is T => value !== false)
      )
    )
  );

type WalletState =
  Awaited<ReturnType<WalletContext['wallet']['state']>> extends Rx.Observable<infer State>
    ? State
    : never;

export const waitForWalletSync = (wallet: WalletContext, timeoutMs: number): Promise<WalletState> =>
  waitForWalletState('wallet sync', timeoutMs, wallet, (state) => state);

export const waitForWallClock = (
  label: string,
  unixSeconds: bigint,
  timeoutMs: number
): Promise<void> =>
  withTimeout(
    label,
    timeoutMs,
    new Promise<void>((resolve) => {
      const check = () => {
        if (BigInt(Math.floor(Date.now() / 1_000)) > unixSeconds) resolve();
        else setTimeout(check, 250);
      };
      check();
    })
  );

export const shieldedAddressOf = (wallet: WalletContext): ShieldedAddress =>
  new ShieldedAddress(
    ShieldedCoinPublicKey.fromHexString(wallet.shieldedSecretKeys.coinPublicKey),
    ShieldedEncryptionPublicKey.fromHexString(wallet.shieldedSecretKeys.encryptionPublicKey)
  );

export const shieldedCoinKeyOf = (wallet: WalletContext) => ({
  bytes: Uint8Array.from(Buffer.from(wallet.shieldedSecretKeys.coinPublicKey, 'hex')),
});

export const providersFor = <C extends CompactContract.Any>(
  wallet: WalletContext,
  config: NetworkConfig,
  storeName: string,
  zkPath: string
): Promise<ContractProviders<C>> => configureProviders<C>(wallet, config, storeName, zkPath);

export const filledBytes = (fill: number, length = 32): Uint8Array =>
  new Uint8Array(length).fill(fill);

export const bigintToBytes32 = (value: bigint): Uint8Array =>
  Uint8Array.from(Buffer.from(value.toString(16).padStart(64, '0'), 'hex'));

export const writeJsonReport = async (reportPath: string, report: unknown): Promise<void> => {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
};

export const stopWallets = async (wallets: readonly WalletContext[]): Promise<void> => {
  await Promise.allSettled(wallets.map((wallet) => wallet.wallet.stop()));
};
