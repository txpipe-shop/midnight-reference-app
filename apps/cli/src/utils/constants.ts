/**
 * This seed gives access to tokens minted in the genesis block of a local development node.
 * Only used in standalone networks to build a wallet with initial funds.
 */
export const GENESIS_MINT_WALLET_SEED =
  '0000000000000000000000000000000000000000000000000000000000000001';

export const DEFAULT_BOOLEAN_VALUE = true;
export const DEFAULT_BYTES32_VALUE = new Uint8Array(32).fill(0);
export const DEFAULT_FIELD_VALUE = 1_000_000_000_000n;