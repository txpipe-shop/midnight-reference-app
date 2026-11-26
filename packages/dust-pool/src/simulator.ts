// Runs the pool contract's circuits in the Compact runtime, without a chain or
// proofs. It executes the same generated code a DApp runs before proving, so it
// checks the contract's logic and the effects each call declares. It does not
// check proof verification, transcript partitioning or fees.
import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
  type ChargedState,
  type ContractState,
} from '@midnight-ntwrk/compact-runtime';
import type { Effects } from '@midnightntwrk/ledger-v9';
import { Contract, ledger, type Ledger, type Witnesses } from './managed/pool/contract/index.js';
import { witnesses, type NoteOpening, type PoolPrivateState } from './witnesses.js';

export interface PoolConfig {
  readonly dustKey: bigint;
  readonly operatorPayout: Uint8Array;
  readonly operatorFeeBps: bigint;
  readonly starsPerDust: bigint;
  readonly minNight: bigint;
  readonly epochStart: bigint;
  readonly epochLength: bigint;
}

export interface Caller {
  /** The DUST secret key the caller claims to hold. */
  readonly dustSecretKey: bigint;
  readonly opening?: NoteOpening;
}

const COIN_PUBLIC_KEY = '00'.repeat(32);
const NOBODY: Caller = { dustSecretKey: 0n };

export class PoolSimulator {
  readonly address = sampleContractAddress();
  private readonly contract: Contract<PoolPrivateState>;
  private state!: ContractState | ChargedState;
  /** Seconds since the Unix epoch, used as the block time of the next call. */
  now: bigint;
  /** The effects declared by the most recent successful call. */
  lastEffects?: Effects;

  private constructor(now: bigint, overrides: Partial<Witnesses<PoolPrivateState>>) {
    this.now = now;
    this.contract = new Contract<PoolPrivateState>({ ...witnesses, ...overrides });
  }

  /** `overrides` replaces individual witnesses, to test how the contract treats dishonest ones. */
  static async deploy(
    config: PoolConfig,
    overrides: Partial<Witnesses<PoolPrivateState>> = {}
  ): Promise<PoolSimulator> {
    const sim = new PoolSimulator(config.epochStart, overrides);
    const result = await sim.contract.initialState(
      createConstructorContext<PoolPrivateState>({ dustSecretKey: 0n }, COIN_PUBLIC_KEY),
      config.dustKey,
      { bytes: config.operatorPayout },
      config.operatorFeeBps,
      config.starsPerDust,
      config.minNight,
      config.epochStart,
      config.epochLength
    );
    sim.state = result.currentContractState;
    return sim;
  }

  get ledger(): Ledger {
    return ledger('data' in this.state ? this.state.data : this.state);
  }

  private async run<A extends unknown[]>(
    circuitId: keyof Contract<PoolPrivateState>['impureCircuits'],
    caller: Caller,
    args: A
  ): Promise<void> {
    const context = createCircuitContext<PoolPrivateState>({
      circuitId,
      contractAddress: this.address,
      coinPublicKeyOrZswapState: COIN_PUBLIC_KEY,
      contractState: this.state,
      privateState: { dustSecretKey: caller.dustSecretKey, opening: caller.opening },
      time: Number(this.now),
    });
    const circuit = this.contract.impureCircuits[circuitId] as (
      ...a: unknown[]
    ) => Promise<{ context: typeof context }>;
    const result = await circuit(context, ...args);
    const query = result.context.queryContexts[this.address];
    this.state = query.state;
    this.lastEffects = query.effects as unknown as Effects;
  }

  enroll(caller: Caller, id: Uint8Array, night: bigint, owner: Uint8Array, epoch: bigint) {
    return this.run('enroll', caller, [id, night, { bytes: owner }, epoch]);
  }

  settle(caller: Caller, id: Uint8Array, epoch: bigint, vFee: bigint, units: bigint) {
    return this.run('settle', caller, [id, epoch, vFee, units]);
  }

  retire(caller: Caller, id: Uint8Array, epoch: bigint) {
    return this.run('retire', caller, [id, epoch]);
  }

  closeEpoch() {
    return this.run('closeEpoch', NOBODY, []);
  }

  claim(id: Uint8Array) {
    return this.run('claim', NOBODY, [id]);
  }

  payout(owner: Uint8Array) {
    return this.run('payout', NOBODY, [{ bytes: owner }]);
  }
}
