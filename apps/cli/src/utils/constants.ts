/**
 * This seed gives access to tokens minted in the genesis block of a local development node.
 * Only used in standalone networks to build a wallet with initial funds.
 */
//export const GENESIS_MINT_WALLET_SEED =
//  "0000000000000000000000000000000000000000000000000000000000000001";
export const GENESIS_MINT_WALLET_SEED =
  'a51c86de32d0791f7cffc3bdff1abd9bb54987f0ed5effc30c936dddbb9afd9d530c8db445e4f2d3ea42a321b260e022aadf05987c9a67ec7b6b6ca1d0593ec9';

export const DEFAULT_BOOLEAN_VALUE = true;
export const DEFAULT_BYTES32_VALUE = new Uint8Array(32).fill(0);
export const DEFAULT_FIELD_VALUE = 1_000_000_000_000n;
