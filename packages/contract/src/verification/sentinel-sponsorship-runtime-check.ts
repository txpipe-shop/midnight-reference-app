import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../managed/sentinel/contract/index.js';

const bytes = (fill: number) => new Uint8Array(32).fill(fill);
const secretKey = bytes(0x01);
const sponsorId = bytes(0x11);
const acceptedColor = bytes(0x22);
const policyHash = bytes(0x33);
const targetAddress = bytes(0x44);
const targetEntryPointHash = bytes(0x55);
const price = 100n;
const contractAddress = sampleContractAddress();
const coinPublicKey = '01'.repeat(32);
const contract = new Contract({
  localSecretKey: ({ privateState }) => [privateState, secretKey],
});

const initial = () =>
  contract.initialState(
    createConstructorContext(null, coinPublicKey),
    sponsorId,
    acceptedColor,
    price,
    policyHash
  );

const context = (result: ReturnType<typeof initial> | ReturnType<typeof contract.circuits.purchaseSponsorship> = initial()) =>
  'context' in result
    ? createCircuitContext(
        contractAddress,
        result.context.currentZswapLocalState,
        result.context.currentQueryContext.state,
        result.context.currentPrivateState
      )
    : createCircuitContext(
        contractAddress,
        coinPublicKey,
        result.currentContractState,
        result.currentPrivateState
      );

const purchase = (
  result: ReturnType<typeof initial> | ReturnType<typeof contract.circuits.purchaseSponsorship>,
  purchaseId: Uint8Array,
  commitment: bigint,
  color = acceptedColor,
  value = price
) =>
  contract.circuits.purchaseSponsorship(
    context(result),
    purchaseId,
    { nonce: bytes(Number(commitment % 255n)), color, value },
    targetAddress,
    targetEntryPointHash,
    commitment
  );

const expectReject = (label: string, action: () => unknown, expected: string) => {
  try {
    action();
    throw new Error(`${label}: unexpectedly succeeded`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expected)) {
      throw new Error(`${label}: expected "${expected}", got "${message}"`);
    }
  }
};

const firstId = bytes(0x61);
const first = purchase(initial(), firstId, 101n);
const firstLedger = ledger(first.context.currentQueryContext.state);
if (firstLedger.sponsorshipRevenue !== price) throw new Error('revenue was not credited');
if (firstLedger.sponsorshipPurchases !== 1n) throw new Error('purchase count was not incremented');
if (!firstLedger.sponsorshipReceipts.member(firstId)) throw new Error('receipt was not recorded');
const receipt = firstLedger.sponsorshipReceipts.lookup(firstId);
if (receipt.targetCommunicationCommitment !== 101n) {
  throw new Error('receipt did not bind the target');
}

expectReject(
  'duplicate purchase id',
  () => purchase(first, firstId, 102n),
  'Duplicate sponsorship purchase'
);
expectReject(
  'wrong payment asset',
  () => purchase(initial(), firstId, 101n, bytes(0x23)),
  'Wrong sponsorship payment asset'
);
expectReject(
  'wrong payment amount',
  () => purchase(initial(), firstId, 101n, acceptedColor, price + 1n),
  'Wrong sponsorship payment amount'
);

const paused = contract.circuits.setSponsorshipEnabled(context(initial()), false);
expectReject(
  'paused campaign',
  () => purchase(paused, firstId, 101n),
  'Sponsorship is paused'
);

console.log(
  JSON.stringify({
    productionSponsorshipRuntime: 'confirmed',
    revenue: firstLedger.sponsorshipRevenue.toString(),
    purchases: firstLedger.sponsorshipPurchases.toString(),
    receiptRecorded: true,
    duplicatePurchaseRejected: true,
    pauseEnforced: true,
  })
);
