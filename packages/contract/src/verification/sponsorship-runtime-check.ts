import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../managed/sponsorship/contract/index.js';

const bytes = (fill: number) => new Uint8Array(32).fill(fill);
const sponsor = bytes(0x11);
const otherSponsor = bytes(0x12);
const color = bytes(0x21);
const otherColor = bytes(0x22);
const nonce = bytes(0x31);
const price = 100n;
const contract = new Contract({});
const coinPublicKey = '01'.repeat(32);
const contractAddress = sampleContractAddress();

const initial = () =>
  contract.initialState(createConstructorContext(null, coinPublicKey), sponsor, color, price);

const run = (sponsorId: Uint8Array, paymentColor: Uint8Array, value: bigint) => {
  const state = initial();
  return contract.circuits.purchaseSponsorship(
    createCircuitContext(
      contractAddress,
      coinPublicKey,
      state.currentContractState,
      state.currentPrivateState
    ),
    sponsorId,
    { nonce, color: paymentColor, value }
  );
};

const expectReject = (
  label: string,
  expectedMessage: string,
  sponsorId: Uint8Array,
  paymentColor: Uint8Array,
  value: bigint
) => {
  try {
    run(sponsorId, paymentColor, value);
    throw new Error(`${label}: unexpectedly succeeded`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) {
      throw new Error(`${label}: expected "${expectedMessage}", got "${message}"`);
    }
  }

  const before = ledger(initial().currentContractState.data);
  if (!before.sponsorRevenue.isEmpty() || !before.sponsorPurchases.isEmpty()) {
    throw new Error(`${label}: rejected call changed fresh contract state`);
  }
};

const first = run(sponsor, color, price);
const firstLedger = ledger(first.context.currentQueryContext.state);
if (firstLedger.sponsorRevenue.lookup(sponsor) !== price) {
  throw new Error('exact payment did not credit sponsor revenue');
}
if (firstLedger.sponsorPurchases.lookup(sponsor) !== 1n) {
  throw new Error('exact payment did not increment sponsor purchases');
}
if (first.context.currentZswapLocalState.outputs.length !== 1) {
  throw new Error('exact payment did not create exactly one contract receipt output');
}

const second = contract.circuits.purchaseSponsorship(
  createCircuitContext(
    contractAddress,
    first.context.currentZswapLocalState,
    first.context.currentQueryContext.state,
    first.context.currentPrivateState
  ),
  sponsor,
  { nonce: bytes(0x32), color, value: price }
);
const secondLedger = ledger(second.context.currentQueryContext.state);
if (secondLedger.sponsorRevenue.lookup(sponsor) !== price * 2n) {
  throw new Error('second payment did not accumulate sponsor revenue');
}
if (secondLedger.sponsorPurchases.lookup(sponsor) !== 2n) {
  throw new Error('second payment did not accumulate sponsor purchases');
}

expectReject('wrong sponsor', 'Unknown sponsor', otherSponsor, color, price);
expectReject('wrong asset', 'Wrong payment asset', sponsor, otherColor, price);
expectReject('amount below price', 'Wrong payment amount', sponsor, color, price - 1n);
expectReject('amount above price', 'Wrong payment amount', sponsor, color, price + 1n);
expectReject('zero payment', 'Wrong payment amount', sponsor, color, 0n);

console.log(
  JSON.stringify({
    vp01: 'confirmed',
    vp02: 'confirmed',
    revenueAfterTwoPurchases: secondLedger.sponsorRevenue.lookup(sponsor).toString(),
    purchasesAfterTwoPurchases: secondLedger.sponsorPurchases.lookup(sponsor).toString(),
    contractReceiptOutputs: second.context.currentZswapLocalState.outputs.length,
  })
);
