import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  deriveSentinelAuthority,
  ledger,
  type PrivateState,
} from '@midnight-sentinel/contract';

const bytes = (fill: number) => new Uint8Array(32).fill(fill);
const equalBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const ownerSecret = bytes(0x01);
const operatorSecret = bytes(0x02);
const rotatedOperatorSecret = bytes(0x03);
const sponsorId = bytes(0x11);
const color = bytes(0);
const sponsorRewardKey = { bytes: bytes(0x21) };
const sponsorRewardEncryptionKey = bytes(0x22);
const delegatorKeys = [{ bytes: bytes(0x31) }, { bytes: bytes(0x32) }, { bytes: bytes(0x33) }];
const delegatorEncryptionKeys = [bytes(0x34), bytes(0x35), bytes(0x36)];
const delegatorIds = [bytes(0x41), bytes(0x42), bytes(0x43)];
const delegatorNightAddresses = [
  new Uint8Array(96).fill(0x44),
  new Uint8Array(96).fill(0x45),
  new Uint8Array(96).fill(0x46),
];
const policyHash = bytes(0x51);
const targetAddress = bytes(0x52);
const targetEntryPointHash = bytes(0x53);
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
    sponsorRewardEncryptionKey,
    share,
    share,
    minimum,
    initialOperator,
    policyHash
  );

const operatorProbe = constructorResult(operatorSecret, bytes(0));
const operatorKey = ledger(operatorProbe.currentContractState.data).owner;
if (!equalBytes(operatorKey, deriveSentinelAuthority(operatorSecret))) {
  throw new Error('off-chain eligibility authority derivation does not match Compact');
}
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
  | ReturnType<typeof contract.circuits.deliverSponsorReward>
  | ReturnType<typeof contract.circuits.setSponsorshipEnabled>;

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
    delegatorNightAddresses[index],
    delegatorKeys[index],
    delegatorEncryptionKeys[index],
    minimum + BigInt(index),
    1000n + BigInt(index),
    1n
  );

const remove = (state: StateResult, index: number, secret = operatorSecret) =>
  contract.circuits.removeDelegator(context(state, secret), delegatorIds[index]);

const update = (state: StateResult, index: number, nonce: bigint, secret = operatorSecret) =>
  contract.circuits.updateDelegator(
    context(state, secret),
    delegatorIds[index],
    delegatorNightAddresses[index],
    delegatorKeys[index],
    delegatorEncryptionKeys[index],
    minimum + BigInt(index),
    2000n + BigInt(index),
    nonce
  );

const purchase = (state: StateResult, index: number) =>
  contract.circuits.purchaseDelegatorReward(context(state, ownerSecret), {
    nonce: bytes(0x70 + index),
    color,
    value: share,
  });

const deliver = (state: StateResult, index: number, paymentColor = color, paymentValue = share) =>
  contract.circuits.deliverSponsorReward(
    context(state, ownerSecret),
    bytes(0x60 + index),
    { nonce: bytes(0x80 + index), color: paymentColor, value: paymentValue },
    targetAddress,
    targetEntryPointHash,
    100n + BigInt(index)
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
      delegatorNightAddresses[0],
      delegatorKeys[0],
      delegatorEncryptionKeys[0],
      minimum - 1n,
      1000n,
      1n
    ),
  'Below minimum registered NIGHT'
);

let queued: StateResult = add(initial(), 0);
queued = add(queued, 1);
queued = add(queued, 2);
expectReject('duplicate delegator', () => add(queued, 0), 'Duplicate delegator');
expectReject(
  'replayed enrollment nonce',
  () => update(queued, 0, 1n),
  'Enrollment nonce must increase'
);
queued = update(queued, 0, 2n);

const rewarded: Uint8Array[] = [];
for (let index = 0; index < 4; index += 1) {
  queued = purchase(queued, index);
  const afterDelegator = ledger(queued.context.currentQueryContext.state);
  if (
    afterDelegator.sponsorshipPurchases !== BigInt(index) ||
    afterDelegator.sponsorshipReceipts.member(bytes(0x60 + index))
  ) {
    throw new Error('delegator circuit unexpectedly changed purchase accounting');
  }

  queued = deliver(queued, index);
  const current = ledger(queued.context.currentQueryContext.state);
  const receipt = current.sponsorshipReceipts.lookup(bytes(0x60 + index));
  rewarded.push(receipt.rewardedDelegatorId);
  if (
    !receipt.sponsorRewardDelivered ||
    receipt.targetCommunicationCommitment !== 100n + BigInt(index) ||
    !equalBytes(receipt.targetAddress, targetAddress) ||
    !equalBytes(receipt.targetEntryPointHash, targetEntryPointHash)
  ) {
    throw new Error('sponsor receipt metadata is incorrect');
  }
}

const expectedRotation = [delegatorIds[0], delegatorIds[1], delegatorIds[2], delegatorIds[0]];
for (let index = 0; index < expectedRotation.length; index += 1) {
  if (!equalBytes(rewarded[index], expectedRotation[index])) {
    throw new Error(`unexpected delegator at rotation position ${index}`);
  }
}

expectReject(
  'wrong sponsor payment asset',
  () => deliver(purchase(add(initial(), 0), 9), 9, bytes(0x7f)),
  'Wrong payment asset'
);
expectReject(
  'wrong sponsor payment amount',
  () => deliver(purchase(add(initial(), 0), 10), 10, color, share + 1n),
  'Wrong sponsor payment amount'
);

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
const maintained = remove(rotated, 1, rotatedOperatorSecret);
const paused = contract.circuits.setSponsorshipEnabled(context(maintained, ownerSecret), false);
expectReject('paused campaign', () => purchase(paused, 11), 'NO_ELIGIBLE_DELEGATOR');
expectReject(
  'queue mutation while paused',
  () => remove(paused, 2, rotatedOperatorSecret),
  'Sponsorship is paused'
);
const resumed = contract.circuits.setSponsorshipEnabled(context(paused, ownerSecret), true);
const resumedLedger = ledger(resumed.context.currentQueryContext.state);
if (resumedLedger.delegatorCount !== 1n || resumedLedger.pausedDelegatorCount !== 0n) {
  throw new Error('resuming sponsorship did not restore the delegator queue');
}
const pausedAgain = contract.circuits.setSponsorshipEnabled(context(resumed, ownerSecret), false);

const finalLedger = ledger(pausedAgain.context.currentQueryContext.state);
if (
  finalLedger.delegatorCount !== 0n ||
  finalLedger.pausedDelegatorCount !== 1n ||
  finalLedger.sponsorshipFixedPrice !== price ||
  finalLedger.sponsorshipSponsor.share !== share ||
  finalLedger.sponsorshipDelegatorShare !== share
) {
  throw new Error('final campaign configuration or queue state is incorrect');
}

console.log(
  JSON.stringify({
    productionRewardSplitRuntime: 'confirmed',
    fixedPrice: price.toString(),
    sponsorShare: share.toString(),
    delegatorShare: share.toString(),
    deterministicRotation: rewarded.map((id) => Buffer.from(id).toString('hex')),
    receiptMetadata: 'confirmed',
    removalCompaction: 'confirmed',
    operatorRotation: 'confirmed',
    pauseEnforced: true,
  })
);
