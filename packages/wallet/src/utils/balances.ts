import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  Bech32mSymbol,
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import type { FacadeState, WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as Rx from 'rxjs';
import { deriveKeysFromSeed } from './index.js';

export interface Balances {
  dust: bigint;
  shielded: Record<string, bigint>;
  unshielded: Record<string, bigint>;
}

export interface Addresses {
  dust: string;
  shielded: string;
  unshielded: string;
}

export interface PublicKeys {
  coin: string;
  encryption: string;
}

const DIVIDER = '──────────────────────────────────────────────────────────────';
const TNIGHT_TOKEN_ID = '0000000000000000000000000000000000000000000000000000000000000000';

function getCoinPublicKey(state: FacadeState): ShieldedCoinPublicKey {
  return ShieldedCoinPublicKey.fromHexString(state.shielded.coinPublicKey.toHexString());
}

function getEncryptionPublicKey(state: FacadeState): ShieldedEncryptionPublicKey {
  return ShieldedEncryptionPublicKey.fromHexString(
    state.shielded.encryptionPublicKey.toHexString()
  );
}

function getPublicKeys(state: FacadeState): PublicKeys {
  return {
    coin: getCoinPublicKey(state).toHexString(),
    encryption: getEncryptionPublicKey(state).toHexString(),
  };
}

function getShieldedAddress(state: FacadeState): string {
  const coinPubKey = getCoinPublicKey(state);
  const encPubKey = getEncryptionPublicKey(state);
  const address = new ShieldedAddress(coinPubKey, encPubKey);
  return MidnightBech32m.encode(getNetworkId(), address).toString();
}

function getUnshieldedAddress(seed: string): MidnightBech32m {
  const keys = deriveKeysFromSeed(seed);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());
  return unshieldedKeystore.getBech32Address();
}

function getAddresses(seed: string, state: FacadeState): Addresses {
  return {
    dust: state.dust.address[Bech32mSymbol].encode(getNetworkId(), state.dust.address).asString(),
    shielded: getShieldedAddress(state),
    unshielded: getUnshieldedAddress(seed).toString(),
  };
}

export function getBalances(state: FacadeState): Balances {
  return {
    dust: state.dust.balance(new Date()),
    shielded: state.shielded.balances,
    unshielded: state.unshielded.balances,
  };
}

export async function getBalancesAndAddresses(
  wallet: WalletFacade,
  seed: string
): Promise<{ balances: Balances; addresses: Addresses; pubKeys: PublicKeys }> {
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  return {
    balances: getBalances(state),
    addresses: getAddresses(seed, state),
    pubKeys: getPublicKeys(state),
  };
}

function formatTokenBalance(tokenId: string, balance: bigint): string {
  const label = tokenId === TNIGHT_TOKEN_ID ? 'tNIGHT' : tokenId;
  return `  • ${label}: ${balance.toLocaleString()}`;
}

function formatSection(
  title: string,
  address: string | undefined,
  balanceLines: string[]
): string[] {
  const sep = '  ' + DIVIDER.slice(0, -2);
  const lines: string[] = ['', `  ${title}`, sep];
  if (address) {
    lines.push(`  Address:  ${address}`);
  }
  if (balanceLines.length > 0) {
    lines.push(address ? '  Balances:' : '  Balance:');
    lines.push(...balanceLines);
  }
  return lines;
}

export function printBalances(
  balances: Balances,
  addresses?: Addresses,
  pubKeys?: PublicKeys
): void {
  const shieldedLines = Object.entries(balances.shielded).map(([token, balance]) =>
    formatTokenBalance(token, balance)
  );
  const unshieldedLines = Object.entries(balances.unshielded).map(([token, balance]) =>
    formatTokenBalance(token, balance)
  );

  const dustSection = [
    '',
    '  DUST',
    '  ' + DIVIDER.slice(0, -2),
    ...(addresses ? [`  Address:  ${addresses.dust}`] : []),
    '  Balance: ' + balances.dust.toLocaleString(),
  ];

  const shieldedSection = formatSection('SHIELDED', addresses?.shielded, shieldedLines);

  const unshieldedSection = formatSection('UNSHIELDED', addresses?.unshielded, unshieldedLines);

  const pubKeySection: string[] = [];

  if (pubKeys) {
    pubKeySection.push(' ');
    pubKeySection.push(' Shielded Public Keys');
    pubKeySection.push(`   Encryption Public Key: ${pubKeys.encryption}`);
    pubKeySection.push(`   Coin Public Key: ${pubKeys.coin}`);
  }

  const output = [
    ...dustSection,
    ...shieldedSection,
    ...pubKeySection,
    ...unshieldedSection,
    '',
  ].join('\n');

  console.log(output);
}
