// A one-process "chain" built on the real ledger 9 implementation.
//
// It holds a LedgerState and applies transactions to it with the ledger's own
// well-formedness and application rules: balancing, signatures, binding
// commitments, replay protection and all DUST bookkeeping run for real.
//
// What it does not do: verify ZK proofs. There is no proof server here, so
// transactions are bound but unproven, and proof verification is switched off.
// It also has no node, mempool or indexer.
import { randomBytes } from 'node:crypto';
import * as L from '@midnightntwrk/ledger-v9';

export const NETWORK = 'undeployed';
export const NIGHT = L.nativeToken().raw;

export interface Account {
  readonly signingKey: L.SigningKey;
  readonly verifyingKey: L.SignatureVerifyingKey;
  readonly address: L.UserAddress;
}

export const newAccount = (): Account => {
  const signingKey = L.sampleSigningKey();
  const verifyingKey = L.signatureVerifyingKey(signingKey);
  return { signingKey, verifyingKey, address: L.addressFromKey(verifyingKey) };
};

export type BoundTx = L.Transaction<L.SignatureEnabled, L.PreProof, L.Binding>;
export type OpenTx = L.UnprovenTransaction;

export class Chain {
  state = L.LedgerState.blank(NETWORK);
  /** Block time, in seconds since the Unix epoch. */
  now = 1_800_000_000;
  /**
   * Every ledger event emitted so far, serialized. The wasm bindings move an
   * `Event` into `replayEvents` and free it, so events are stored as bytes and
   * a fresh `Event` is deserialized for each reader (see {@link freshEvents}).
   */
  readonly rawEvents: Uint8Array[] = [];
  private readonly strictness = new L.WellFormedStrictness();

  constructor() {
    this.strictness.enforceBalancing = true;
    this.strictness.verifySignatures = true;
    // No proof server here, so proofs are not verified.
    this.strictness.verifyNativeProofs = false;
    this.strictness.verifyContractProofs = false;
    // Gas limits and the time-to-dismiss bound are sized from a real proven
    // transaction. These are mock, unproven transactions, so their size is not
    // representative; limit-checking (and transcript partitioning) is a devnet
    // concern. Balancing, signatures, binding and DUST rules stay enforced.
    this.strictness.enforceLimits = false;
  }

  get date(): Date {
    return new Date(this.now * 1000);
  }

  get params(): L.LedgerParameters {
    return this.state.parameters;
  }

  /** Lets time pass without a transaction. */
  advance(seconds: number): void {
    this.now += seconds;
    this.state = this.state.postBlockUpdate(this.date);
  }

  /** A TTL comfortably inside the ledger's one-hour window. */
  ttl(): Date {
    return new Date((this.now + 600) * 1000);
  }

  /**
   * Applies a transaction as the next block. Throws if the ledger rejects it
   * as malformed; returns the ledger's result otherwise.
   */
  submit(tx: L.Transaction<L.Signaturish, L.Proofish, L.Bindingish>): L.TransactionResult {
    const verified = tx.wellFormed(this.state, this.strictness, this.date);
    const context = new L.TransactionContext(this.state, {
      secondsSinceEpoch: BigInt(this.now),
      secondsSinceEpochErr: 0,
      parentBlockHash: '00'.repeat(32),
      lastBlockTime: BigInt(this.now - 6),
    });
    const [next, result] = this.state.apply(verified, context);
    this.state = next.postBlockUpdate(this.date);
    for (const event of result.events) {
      this.rawEvents.push(event.serialize());
    }
    this.now += 6;
    return result;
  }

  /** Fresh `Event` objects for the events from index `from` onward. */
  freshEvents(from = 0): L.Event[] {
    return this.rawEvents.slice(from).map((raw) => L.Event.deserialize(raw));
  }

  /** Gives an account one NIGHT UTXO, through the ledger's reward-claim path. */
  fund(account: Account, stars: bigint): L.Utxo {
    const before = new Set([...this.state.utxo.filter(account.address)].map(utxoKey));
    this.state = this.state
      .testingDistributeNight(account.address, stars, this.date)
      .postBlockUpdate(this.date);
    const claim = L.ClaimRewardsTransaction.new(
      NETWORK,
      stars,
      account.verifyingKey,
      randomBytes(32).toString('hex'),
      'Reward'
    );
    const signed = claim.addSignature(L.signData(account.signingKey, claim.dataToSign));
    const result = this.submit(L.Transaction.fromRewards(signed));
    if (result.type !== 'success') {
      throw new Error(`funding failed: ${result.error}`);
    }
    const created = [...this.state.utxo.filter(account.address)].find(
      (utxo) => !before.has(utxoKey(utxo))
    );
    if (!created) {
      throw new Error('funding created no UTXO');
    }
    return created;
  }

  utxosOf(account: Account): L.Utxo[] {
    return [...this.state.utxo.filter(account.address)];
  }

  balanceOf(account: Account): bigint {
    return this.utxosOf(account)
      .filter((utxo) => utxo.type === NIGHT)
      .reduce((sum, utxo) => sum + utxo.value, 0n);
  }
}

const utxoKey = (utxo: L.Utxo) => `${utxo.intentHash}:${utxo.outputNo}`;

export const spendOf = (utxo: L.Utxo, owner: Account): L.UtxoSpend => ({
  value: utxo.value,
  owner: owner.verifyingKey,
  type: utxo.type,
  intentHash: utxo.intentHash,
  outputNo: utxo.outputNo,
});

export const nightTo = (recipient: L.UserAddress, value: bigint): L.UtxoOutput => ({
  value,
  owner: recipient,
  type: NIGHT,
});

/**
 * Signs every unshielded input of an intent, and its DUST registrations, with
 * the one account that owns them. The signature covers the whole intent.
 */
export const signIntent = (
  intent: L.UnprovenIntent,
  segment: number,
  signer: Account
): L.UnprovenIntent => {
  const signature = new L.SignatureEnabled(
    L.signData(signer.signingKey, intent.signatureData(segment))
  );
  const guaranteed = intent.guaranteedUnshieldedOffer;
  if (guaranteed && guaranteed.inputs.length > 0) {
    intent.guaranteedUnshieldedOffer = guaranteed.addSignatures(
      guaranteed.inputs.map(() => signature)
    );
  }
  const actions = intent.dustActions;
  if (actions && actions.registrations.length > 0) {
    intent.dustActions = new L.DustActions(
      'signature',
      'pre-proof',
      actions.ctime,
      actions.spends,
      actions.registrations.map(
        (r) =>
          new L.DustRegistration(
            'signature',
            r.nightKey,
            r.dustAddress,
            r.allowFeePayment,
            signature
          )
      )
    );
  }
  return intent;
};

/** A transaction holding the given intents at the given segment ids, not yet bound. */
export const txOf = (intents: ReadonlyArray<readonly [number, L.UnprovenIntent]>): OpenTx => {
  let tx = L.Transaction.fromParts(NETWORK);
  for (const [segment, intent] of intents) {
    tx = tx.addIntent({ tag: 'specific', value: segment }, intent);
  }
  return tx;
};

/**
 * The operator's view of the pool's DUST, kept in sync from ledger events.
 *
 * It holds the DUST key as a seed, not a `DustSecretKey` object: the ledger's
 * wasm bindings move a key into `spend` and `replayEvents` and free it, so a
 * fresh instance is minted for each consuming call. That also lets two wallets
 * (for example a disposable one used to quote a fee) share one pool identity.
 */
export class DustWallet {
  local: L.DustLocalState;
  readonly publicKey: L.DustPublicKey;
  private seen = 0;

  constructor(
    readonly chain: Chain,
    private readonly _seed: Uint8Array
  ) {
    this.local = new L.DustLocalState(chain.params.dust);
    this.publicKey = this.key().publicKey;
  }

  /** The seed, to build a second wallet with the same pool identity. */
  seed(): Uint8Array {
    return this._seed;
  }

  /** A fresh secret-key instance; callers must not reuse one across wasm calls. */
  key(): L.DustSecretKey {
    return L.DustSecretKey.fromSeed(this._seed);
  }

  sync(): this {
    const fresh = this.chain.freshEvents(this.seen);
    this.seen = this.chain.rawEvents.length;
    this.local = this.local.replayEvents(this.key(), fresh).processTtls(this.chain.date);
    return this;
  }

  get utxos(): L.QualifiedDustOutput[] {
    return this.sync().local.utxos;
  }

  /** Builds a DustSpend of `vFee` from one UTXO and returns the UTXO that spend creates. */
  spend(
    utxo: L.QualifiedDustOutput,
    vFee: bigint
  ): {
    spend: L.DustSpend<L.PreProof>;
    successor: L.QualifiedDustOutput;
  } {
    this.sync();
    const generation = this.local.generationInfo(utxo);
    if (!generation) {
      throw new Error('no generation info for this DUST UTXO');
    }
    const [next, spend] = this.local.spend(this.key(), utxo, vFee, this.chain.date);
    this.local = next;
    // The commitment index is assigned on inclusion and is not part of the
    // commitment or the nullifier, so any placeholder works here.
    const successor = L.successorDustUtxo(
      utxo,
      this.chain.date,
      vFee,
      0n,
      generation,
      this.key(),
      this.chain.params.dust
    );
    return { spend, successor };
  }
}
