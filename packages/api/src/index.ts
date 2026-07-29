import { Transaction, SignatureEnabled, Proof, Binding } from '@midnight-ntwrk/ledger-v8';
import { MidnightBech32m, ShieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import {
  CompactCompiledContract,
  createPrivateState,
  Ledger,
  ledger,
  sentinelContractPrivateStateKey,
  type ContractAddress,
  type PrivateState,
  type SentinelContractDeployed,
  type SentinelContractProviders,
  type SentinelContractType,
} from '@midnight-sentinel/contract';
import { getNetworkId, WalletContext } from '@midnight-sentinel/wallet';
import { map, type Observable } from 'rxjs';

export const toHex = (arr: Uint8Array) =>
  '0x' +
  Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export interface Config {
  indexer: string;
  indexerWS: string;
  proofServer: string;
}

export interface SentinelSponsorshipConfig {
  sponsorId: Uint8Array;
  acceptedColor: Uint8Array;
  sponsorRewardKey: { bytes: Uint8Array };
  sponsorRewardEncryptionKey: Uint8Array;
  sponsorShare: bigint;
  delegatorShare: bigint;
  minimumRegisteredNight: bigint;
  initialEligibilityOperator: Uint8Array;
  policyHash: Uint8Array;
}

export interface SentinelDerivedState {
  owner: string;
  sponsorshipSponsorId: Uint8Array;
  sponsorshipAcceptedColor: Uint8Array;
  sponsorshipFixedPrice: bigint;
  sponsorshipSponsorShare: bigint;
  sponsorshipDelegatorShare: bigint;
  sponsorshipMinimumRegisteredNight: bigint;
  sponsorshipPolicyHash: Uint8Array;
  sponsorshipEnabled: boolean;
  eligibilityOperator: Uint8Array;
  delegatorCount: bigint;
  pausedDelegatorCount: bigint;
  rewardCursor: bigint;
  delegatorSlots: Ledger['delegatorSlots'];
  delegatorPositions: Ledger['delegatorPositions'];
  sponsorshipPurchases: bigint;
  sponsorshipReceipts: Ledger['sponsorshipReceipts'];
}

const deriveSentinelState = (data: Parameters<typeof ledger>[0]): SentinelDerivedState => {
  const ledgerState = ledger(data);
  return {
    owner: toHex(ledgerState.owner),
    sponsorshipSponsorId: ledgerState.sponsorshipSponsor.id,
    sponsorshipAcceptedColor: ledgerState.sponsorshipAcceptedColor,
    sponsorshipFixedPrice: ledgerState.sponsorshipFixedPrice,
    sponsorshipSponsorShare: ledgerState.sponsorshipSponsor.share,
    sponsorshipDelegatorShare: ledgerState.sponsorshipDelegatorShare,
    sponsorshipMinimumRegisteredNight: ledgerState.sponsorshipMinimumRegisteredNight,
    sponsorshipPolicyHash: ledgerState.sponsorshipSponsor.policyHash,
    sponsorshipEnabled: ledgerState.sponsorshipEnabled,
    eligibilityOperator: ledgerState.eligibilityOperator,
    delegatorCount: ledgerState.delegatorCount,
    pausedDelegatorCount: ledgerState.pausedDelegatorCount,
    rewardCursor: ledgerState.rewardCursor,
    delegatorSlots: ledgerState.delegatorSlots,
    delegatorPositions: ledgerState.delegatorPositions,
    sponsorshipPurchases: ledgerState.sponsorshipPurchases,
    sponsorshipReceipts: ledgerState.sponsorshipReceipts,
  };
};

export class SentinelContract {
  readonly providers: SentinelContractProviders;
  readonly deployedContract: SentinelContractDeployed | null;
  readonly contractAddress: ContractAddress;
  readonly state$: Observable<SentinelDerivedState>;

  private constructor(
    providers: SentinelContractProviders,
    deployedContract: SentinelContractDeployed | null,
    contractAddress: ContractAddress,
    state$: Observable<SentinelDerivedState>
  ) {
    this.providers = providers;
    this.deployedContract = deployedContract;
    this.contractAddress = contractAddress;
    this.state$ = state$;
  }

  static async deploy(
    providers: SentinelContractProviders,
    sponsorship: SentinelSponsorshipConfig
  ): Promise<SentinelContract> {
    console.log('[deploy] Starting contract deployment...');
    const deployedContract = await deployContract<SentinelContractType>(providers, {
      compiledContract: CompactCompiledContract,
      privateStateId: sentinelContractPrivateStateKey,
      initialPrivateState: await this.getPrivateState(providers, ''),
      args: [
        sponsorship.sponsorId,
        sponsorship.acceptedColor,
        sponsorship.sponsorRewardKey,
        sponsorship.sponsorRewardEncryptionKey,
        sponsorship.sponsorShare,
        sponsorship.delegatorShare,
        sponsorship.minimumRegisteredNight,
        sponsorship.initialEligibilityOperator,
        sponsorship.policyHash,
      ],
    });

    const contractAddress = deployedContract.deployTxData.public.contractAddress;
    const state$ = providers.publicDataProvider
      .contractStateObservable(contractAddress, { type: 'latest' })
      .pipe(map((contractState) => deriveSentinelState(contractState.data)));

    console.debug('Deployment fees: ', deployedContract.deployTxData.public.fees);
    return new SentinelContract(providers, deployedContract, contractAddress, state$);
  }

  static async join(
    providers: SentinelContractProviders,
    contractAddress: ContractAddress
  ): Promise<SentinelContract> {
    console.log('[join] Finding existing contract...');
    const deployedContract = await findDeployedContract<SentinelContractType>(providers, {
      contractAddress,
      compiledContract: CompactCompiledContract,
      privateStateId: sentinelContractPrivateStateKey,
      initialPrivateState: await this.getPrivateState(providers, contractAddress),
    });

    const state$ = providers.publicDataProvider
      .contractStateObservable(contractAddress, { type: 'latest' })
      .pipe(map((contractState) => deriveSentinelState(contractState.data)));

    console.log('[join] Contract joined');
    return new SentinelContract(providers, deployedContract, contractAddress, state$);
  }

  async delegate(key: string, value: bigint) {
    void key;
    void value;
    throw new Error('Delegation was removed from the sponsorship-only Sentinel');
  }

  async withdraw() {
    throw new Error('Legacy delegation withdrawal was removed');
  }

  async depositRewards(
    value: bigint,
    nonce: Uint8Array<ArrayBufferLike>,
    color: Uint8Array<ArrayBufferLike>
  ) {
    void value;
    void nonce;
    void color;
    throw new Error('Legacy rewards were removed');
  }

  async redeemRewards() {
    throw new Error('Legacy rewards were removed');
  }

  async setSponsorshipEnabled(enabled: boolean) {
    const tx = await this.deployedContract?.callTx.setSponsorshipEnabled(enabled);
    console.log(`[sponsorship] ${enabled ? 'Enabled' : 'Paused'} on tx: ${tx?.public.txHash}`);
    return tx;
  }

  async addDelegator(input: {
    identity: Uint8Array;
    nightRewardAddress: Uint8Array;
    rewardKey: Uint8Array;
    rewardEncryptionKey: Uint8Array;
    registeredAmount: bigint;
    verificationBlock: bigint;
    enrollmentNonce: bigint;
  }) {
    if (!this.deployedContract) throw new Error('Sentinel contract is not joined');
    return this.deployedContract.callTx.addDelegator(
      input.identity,
      input.nightRewardAddress,
      { bytes: input.rewardKey },
      input.rewardEncryptionKey,
      input.registeredAmount,
      input.verificationBlock,
      input.enrollmentNonce
    );
  }

  async updateDelegator(input: Parameters<SentinelContract['addDelegator']>[0]) {
    if (!this.deployedContract) throw new Error('Sentinel contract is not joined');
    return this.deployedContract.callTx.updateDelegator(
      input.identity,
      input.nightRewardAddress,
      { bytes: input.rewardKey },
      input.rewardEncryptionKey,
      input.registeredAmount,
      input.verificationBlock,
      input.enrollmentNonce
    );
  }

  async removeDelegator(identity: Uint8Array) {
    if (!this.deployedContract) throw new Error('Sentinel contract is not joined');
    return this.deployedContract.callTx.removeDelegator(identity);
  }

  async rotateEligibilityOperator(authority: Uint8Array) {
    if (!this.deployedContract) throw new Error('Sentinel contract is not joined');
    return this.deployedContract.callTx.rotateEligibilityOperator(authority);
  }

  async withdrawSponsorshipRevenue() {
    throw new Error('Sponsorship treasury recovery is deferred; v1 payments are a contract sink');
  }

  static async startZswap(ctx: WalletContext, color: string, amount: string, addr: string) {
    console.log(`[startZswap] Initiating swap: ${amount} tokens of type ${color} to ${addr}...`);
    const shieldedAddr = ShieldedAddress.codec.decode(getNetworkId(), MidnightBech32m.parse(addr));
    const swapRecipe = await ctx.wallet.initSwap(
      { shielded: { [color]: BigInt(amount) } },
      [
        {
          type: 'shielded',
          outputs: [{ type: color, amount: BigInt(amount), receiverAddress: shieldedAddr }],
        },
      ],
      { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
      { ttl: TTL(), payFees: false }
    );
    console.log('[startZswap] Finalizing recipe...');
    const finalizedSwapTx = await ctx.wallet.finalizeRecipe(swapRecipe);
    const serializedSwap = finalizedSwapTx.serialize();
    const hex = Buffer.from(serializedSwap).toString('hex');
    console.log('[startZswap] Serialized transaction (hex):');
    console.log(hex);
    console.log(`[startZswap] Transaction length: ${hex.length} chars (hex)`);
  }

  static async zswapSponsor(ctx: WalletContext, finalizedSwapRaw: string) {
    console.log('[zswapSponsor] Loading transaction from input...');
    const finalizedSwapBuffer = new Uint8Array(Buffer.from(finalizedSwapRaw.trim(), 'hex'));
    console.log(`[zswapSponsor] Deserializing transaction (${finalizedSwapRaw.length} chars)...`);
    const tx = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
      'signature',
      'proof',
      'binding',
      finalizedSwapBuffer
    );
    console.log('[zswapSponsor] Balancing transaction with DUST sponsorship...');
    const txHash = await ctx.wallet
      .balanceFinalizedTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: TTL(), tokenKindsToBalance: ['dust'] }
      )
      .then((recipe) => {
        console.log('[zswapSponsor] Finalizing recipe...');
        return ctx.wallet.finalizeRecipe(recipe);
      })
      .then((finalized) => {
        console.log('[zswapSponsor] Submitting transaction...');
        return ctx.wallet.submitTransaction(finalized);
      });
    console.log(`[zswapSponsor] ✓ Transaction submitted: ${txHash}`);
  }

  async getCurrentState() {
    console.log('[getCurrentState] Fetching contract state...');
    let subscription: { unsubscribe: () => void } | null = null;

    subscription = this.state$.subscribe((state) => {
      // Ensure we only handle the first emission
      subscription?.unsubscribe();

      console.log('Owner: ', state.owner);
      console.log('Sponsorship enabled: ', state.sponsorshipEnabled);
      console.log('Sponsorship price: ', state.sponsorshipFixedPrice);
      console.log(
        'Derived sponsorship revenue: ',
        state.sponsorshipPurchases * state.sponsorshipFixedPrice
      );
      console.log('Sponsorship purchases: ', state.sponsorshipPurchases);
    });
  }

  async readState(): Promise<SentinelDerivedState> {
    const contractState = await this.providers.publicDataProvider.queryContractState(
      this.contractAddress
    );
    if (!contractState) {
      throw new Error(`Sentinel state not found: ${this.contractAddress}`);
    }
    return deriveSentinelState(contractState.data);
  }

  private static async getPrivateState(
    providers: SentinelContractProviders,
    contractAddress: string
  ): Promise<PrivateState> {
    providers.privateStateProvider.setContractAddress(contractAddress);
    const existingPrivateState = await providers.privateStateProvider.get(
      sentinelContractPrivateStateKey
    );
    return existingPrivateState ?? createPrivateState(crypto.getRandomValues(new Uint8Array(32)));
  }

  async mintFreeToken(recipientCoinPubKeyHex: string, recipientEncPubKeyHex: string) {
    void recipientCoinPubKeyHex;
    void recipientEncPubKeyHex;
    throw new Error('Legacy test-token minting was removed');
  }
}

/** Rolling 30-minute TTL for all transactions. */
const TTL = () => new Date(Date.now() + 30 * 60 * 1_000);
