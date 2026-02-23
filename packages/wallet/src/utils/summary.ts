import { unshieldedToken } from '@midnight-ntwrk/ledger-v7';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import { FacadeState } from '@midnight-ntwrk/wallet-sdk-facade';
import { UnshieldedKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { formatBalance } from './index.js';

/**
 * Prints a formatted wallet summary to the console, showing all three
 * wallet types (Shielded, Unshielded, Dust) with their addresses and balances.
 */
export const printWalletSummary = (
  seed: string,
  state: FacadeState,
  unshieldedKeystore: UnshieldedKeystore
) => {
  const networkId = getNetworkId();
  const unshieldedBalance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;

  // Build the bech32m shielded address from coin + encryption public keys
  const coinPubKey = ShieldedCoinPublicKey.fromHexString(
    state.shielded.coinPublicKey.toHexString()
  );
  const encPubKey = ShieldedEncryptionPublicKey.fromHexString(
    state.shielded.encryptionPublicKey.toHexString()
  );
  const shieldedAddress = MidnightBech32m.encode(
    networkId,
    new ShieldedAddress(coinPubKey, encPubKey)
  ).toString();

  const DIV = '──────────────────────────────────────────────────────────────';

  console.log(`
${DIV}
  Wallet Overview                            Network: ${networkId}
${DIV}
  Seed: ${seed}
${DIV}

  Shielded (ZSwap)
  └─ Address: ${shieldedAddress}

  Unshielded
  ├─ Address: ${unshieldedKeystore.getBech32Address()}
  └─ Balance: ${formatBalance(unshieldedBalance)} tNight

  Dust
  └─ Address: ${state.dust.dustAddress}

${DIV}`);
};
