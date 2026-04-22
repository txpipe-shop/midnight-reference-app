import { mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/**
 * This seed gives access to tokens minted in the genesis block of a local development node.
 * Only used in standalone networks to build a wallet with initial funds.
 */
export const GENESIS_MINT_WALLET_SEED_ONE =
  '0000000000000000000000000000000000000000000000000000000000000001';
export const GENESIS_MINT_WALLET_SEED_TWO =
  '0000000000000000000000000000000000000000000000000000000000000002';
export const GENESIS_MINT_WALLET_SEED_THREE =
  '0000000000000000000000000000000000000000000000000000000000000003';

//const WALLET_FOUR_SEED_PHRASE = "cabbage pipe bar adapt chronic sing diet upper owner tilt holiday series mango blur lawn liquid car mail elephant cycle simple course profit grab";
//export const MINT_WALLET_SEED_FOUR = Buffer.from(mnemonicToEntropy(WALLET_FOUR_SEED_PHRASE, wordlist)).toString('hex');
const WALLET_FIVE_SEED_PHRASE =
  'kite cereal sunset anger unlock feed chat knee private note pen cup possible nest dad salad figure father volume fortune scale tell supply cargo';
export const MINT_WALLET_SEED_FIVE = Buffer.from(
  mnemonicToEntropy(WALLET_FIVE_SEED_PHRASE, wordlist)
).toString('hex');

export const MINT_WALLET_SEED_FOUR =
  'a51c86de32d0791f7cffc3bdff1abd9bb54987f0ed5effc30c936dddbb9afd9d530c8db445e4f2d3ea42a321b260e022aadf05987c9a67ec7b6b6ca1d0593ec9';
