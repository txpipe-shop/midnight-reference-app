import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../managed/reward-split/contract/index.js';
import type { PrivateState } from '../private-state.js';

const bytes = (fill: number) => new Uint8Array(32).fill(fill);
const equalBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const ownerSecret = bytes(0x01);
const operatorSecret = bytes(0x02);
const rotatedOperatorSecret = bytes(0x03);
const sponsorId = bytes(0x11);
const color = bytes(0);
const sponsorRewardKey = { bytes: bytes(0x21) };
const delegatorKeys = [{ bytes: bytes(0x31) }, { bytes: bytes(0x32) }, { bytes: bytes(0x33) }];
const delegatorIds = [bytes(0x41), bytes(0x42), bytes(0x43)];
const contractAddress = sampleContractAddress();
const coinPublicKey = '01'.repeat(32);
const share = 1n;
const price = share * 2n;
const minimum = 100n;
const contract = new Contract<PrivateState>({
  localSecretKey: ({ privateState }) => [privateState, privateState.secretKey],
});

const constructorResult = (secretKey: Uint8Array, initialOperator: Uint8Array) =>
  contract.initialState(
    createConstructorContext({ secretKey }, coinPublicKey),
    sponsorId,
    color,
    sponsorRewardKey,
    share,
    share,
    minimum,
    initialOperator
  );

const operatorProbe = constructorResult(operatorSecret, bytes(0));
const operatorKey = ledger(operatorProbe.currentContractState.data).owner;
const rotatedOperatorProbe = constructorResult(rotatedOperatorSecret, bytes(0));
const rotatedOperatorKey = ledger(rotatedOperatorProbe.currentContractState.data).owner;
const initial = () => constructorResult(ownerSecret, operatorKey);

type StateResult =
  | ReturnType<typeof initial>
  | ReturnType<typeof contract.circuits.addDelegator>
  | ReturnType<typeof contract.circuits.updateDelegator>
  | ReturnType<typeof contract.circuits.removeDelegator>
  | ReturnType<typeof contract.circuits.rotateEligibilityOperator>
  | ReturnType<typeof contract.circuits.purchaseDelegatorReward>
  | ReturnType<typeof contract.circuits.deliverSponsorReward>;

const context = (state: StateResult, secretKey: Uint8Array) =>
  'context' in state
    ? createCircuitContext(
        contractAddress,
        state.context.currentZswapLocalState,
        state.context.currentQueryContext.state,
        { secretKey }
      )
    : createCircuitContext(contractAddress, coinPublicKey, state.currentContractState, {
        secretKey,
      });

const add = (state: StateResult, index: number, secret = operatorSecret) =>
  contract.circuits.addDelegator(
    context(state, secret),
    delegatorIds[index],
    delegatorKeys[index],
    minimum + BigInt(index),
    1000n + BigInt(index)
  );

const remove = (state: StateResult, index: number, secret = operatorSecret) =>
  contract.circuits.removeDelegator(context(state, secret), delegatorIds[index]);

const purchase = (state: StateResult, index: number) =>
  contract.circuits.purchaseDelegatorReward(context(state, ownerSecret), {
    nonce: bytes(0x70 + index),
    color,
    value: share,
  });

const deliverSponsorReward = (state: StateResult, index: number) =>
  contract.circuits.deliverSponsorReward(context(state, ownerSecret), bytes(0x60 + index), {
    nonce: bytes(0x80 + index),
    color,
    value: share,
  });

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

expectReject('empty queue', () => purchase(initial(), 0), 'NO_ELIGIBLE_DELEGATOR');
expectReject(
  'unauthorized add',
  () => add(initial(), 0, ownerSecret),
  'Not the eligibility operator'
);
expectReject(
  'below minimum',
  () =>
    contract.circuits.addDelegator(
      context(initial(), operatorSecret),
      delegatorIds[0],
      delegatorKeys[0],
      minimum - 1n,
      1000n
    ),
  'Below minimum registered NIGHT'
);

let queued: StateResult = add(initial(), 0);
queued = add(queued, 1);
queued = add(queued, 2);
expectReject('duplicate delegator', () => add(queued, 0), 'Duplicate delegator');

const rewarded: Uint8Array[] = [];
for (let index = 0; index < 4; index += 1) {
  queued = purchase(queued, index);
  const delegatorLedger = ledger(queued.context.currentQueryContext.state);
  if (
    delegatorLedger.sponsorshipPurchases !== BigInt(index) ||
    delegatorLedger.sponsorshipReceipts.member(bytes(0x60 + index))
  ) {
    throw new Error('delegator circuit unexpectedly changed queue accounting');
  }
  queued = deliverSponsorReward(queued, index);
  const current = ledger(queued.context.currentQueryContext.state);
  const deliveredReceipt = current.sponsorshipReceipts.lookup(bytes(0x60 + index));
  rewarded.push(deliveredReceipt.rewardedDelegatorId);
  if (!deliveredReceipt.sponsorRewardDelivered) {
    throw new Error('sponsor circuit did not mark the reward delivered');
  }
  // receiveShielded records the contract receipt commitment and each chained
  // immediate send records its sent/change commitments. The two intermediate
  // coins are consumed inside the transaction; the final ledger has the
  // sponsor and delegator outputs.
  if (queued.context.currentZswapLocalState.outputs.length !== (index + 1) * 4) {
    throw new Error(
      `purchase did not append the expected split transcript commitments: observed ${queued.context.currentZswapLocalState.outputs.length}`
    );
  }
}

const expectedRotation = [delegatorIds[0], delegatorIds[1], delegatorIds[2], delegatorIds[0]];
for (let index = 0; index < expectedRotation.length; index += 1) {
  if (!equalBytes(rewarded[index], expectedRotation[index])) {
    throw new Error(`unexpected delegator at rotation position ${index}`);
  }
}

const beforeRemoval = ledger(queued.context.currentQueryContext.state);
if (beforeRemoval.rewardCursor !== 1n || beforeRemoval.sponsorshipPurchases !== 4n) {
  throw new Error('rotation cursor or purchase count is incorrect');
}
queued = remove(queued, 0);
const afterRemoval = ledger(queued.context.currentQueryContext.state);
if (
  afterRemoval.delegatorCount !== 2n ||
  afterRemoval.rewardCursor !== 0n ||
  !equalBytes(afterRemoval.delegatorSlots.lookup(0n).nightIdentity, delegatorIds[1])
) {
  throw new Error('removing before the cursor did not compact and adjust the queue');
}

const rotated = contract.circuits.rotateEligibilityOperator(
  context(queued, ownerSecret),
  rotatedOperatorKey
);
expectReject(
  'old operator after rotation',
  () => remove(rotated, 1, operatorSecret),
  'Not the eligibility operator'
);
const removedByRotatedOperator = remove(rotated, 1, rotatedOperatorSecret);
const finalLedger = ledger(removedByRotatedOperator.context.currentQueryContext.state);
if (finalLedger.delegatorCount !== 1n) {
  throw new Error('rotated operator could not maintain the queue');
}

console.log(
  JSON.stringify({
    rewardSplitRuntime: 'confirmed',
    fixedPrice: price.toString(),
    sponsorShare: share.toString(),
    delegatorShare: share.toString(),
    rewardOutputsPerPurchase: 2,
    deterministicRotation: rewarded.map((id) => Buffer.from(id).toString('hex')),
    removalCompaction: 'confirmed',
    operatorRotation: 'confirmed',
  })
);
