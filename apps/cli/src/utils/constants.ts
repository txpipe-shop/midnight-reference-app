import { LedgerParameters } from "@midnight-ntwrk/ledger-v7";
import { type DustWalletOptions } from "@midnight-ntwrk/testkit-js";

export const GENESIS_MINT_WALLET_SEED = "0000000000000000000000000000000000000000000000000000000000000001";

const DEFAULT_DUST_OPTIONS: DustWalletOptions = {
  ledgerParams: LedgerParameters.initialParameters(),
  additionalFeeOverhead: 1_000n,
  feeBlocksMargin: 5,
};