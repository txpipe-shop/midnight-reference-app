import { fromHex } from '@midnight-ntwrk/compact-runtime';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import {
  BooleanProp,
  CompactCompiledContract,
  Input,
  Ledger,
  ledger,
  Proposition,
  sentinelContractPrivateStateKey,
  type ContractAddress,
  type PrivateState,
  type SentinelContractDeployed,
  type SentinelContractProviders,
  type SentinelContractType,
  type Rules as SentinelRules,
} from '@midnight-sentinel/contract';
import { map, type Observable } from 'rxjs';

export { parsedHelper as normalizeRule, rules as rulesBuilder, validateRules } from './ruleBuilder.js';

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

export interface SentinelDerivedState {
  rules: Ledger['rules'];
  adminString: string;
}

export class SentinelContract {
  readonly providers: SentinelContractProviders;
  readonly deployedContract: SentinelContractDeployed | null;
  readonly state$: Observable<SentinelDerivedState>;

  private constructor(
    providers: SentinelContractProviders,
    deployedContract: SentinelContractDeployed | null,
    state$: Observable<SentinelDerivedState>
  ) {
    this.providers = providers;
    this.deployedContract = deployedContract;
    this.state$ = state$;
  }

  static prettyRules(rules: SentinelRules): string {
    const formatOrdOp = (op: number) => {
      switch (op) {
        case 0:
          return '>';
        case 1:
          return '<';
        case 2:
          return '=';
        case 3:
          return '!=';
        case 4:
          return '>=';
        case 5:
          return '<=';
        default:
          return '?';
      }
    };

    const formatEqOp = (op: number) => {
      switch (op) {
        case 0:
          return '=';
        case 1:
          return '!=';
        default:
          return '?';
      }
    };

    const toHex = (arr: Uint8Array) =>
      '0x' +
      Array.from(arr)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    const formatValue = (val: bigint | BooleanProp | boolean | Uint8Array) => {
      if (typeof val === 'bigint') {
        return val.toString();
      } else if (typeof val === 'boolean') {
        return val ? 'true' : 'false';
      } else if (val instanceof Uint8Array) {
        const hex = toHex(val);
        return hex.length > 20 ? hex.slice(0, 6) + '...' + hex.slice(-4) : hex;
      }
      return String(val);
    };
    const formatComparison = (v: Proposition): string => {
      if (v.is_left) {
        return `${formatValue(v.left.value)} ${formatOrdOp(v.left.op)} input.u32`;
      }
      const v1 = v.right;
      if (v1.is_left) {
        return `${formatValue(v1.left.value)} ${formatEqOp(v1.left.op)} input.boolean`;
      }
      const v2 = v1.right;
      if (v2.is_left) {
        return `${formatValue(v2.left.value)} ${formatEqOp(v2.left.op)} input.bytes32`;
      }
      const v3 = v2.right;
      if (v3.is_left) {
        return `${formatValue(v3.left.value)} ${formatEqOp(v3.left.op)} input.field`;
      }
      const v4 = v3.right;
      return `${formatValue(v4.nullifier)} ${formatEqOp(v4.op)} input.nullifier`;
    };

    const clauses = rules
      .filter((r) => r.is_some)
      .map((r) => {
        const comparisons = r.value.filter((c) => c.is_some).map((c) => formatComparison(c.value));
        return `(${comparisons.join(' ∧ ')})`;
      });

    return clauses.join(' ∨ ');
  }

  static async deploy(
    providers: SentinelContractProviders,
    privateState: PrivateState
  ): Promise<SentinelContract> {
    const deployedContract = await deployContract<SentinelContractType>(providers, {
      compiledContract: CompactCompiledContract,
      privateStateId: sentinelContractPrivateStateKey,
      initialPrivateState: privateState,
      args: [{ bytes: fromHex(providers.walletProvider.getCoinPublicKey()) }],
    });

    const contractAddress = deployedContract.deployTxData.public.contractAddress;
    const state$ = providers.publicDataProvider
      .contractStateObservable(contractAddress, { type: 'latest' })
      .pipe(
        map((contractState) => {
          const ledgerState = ledger(contractState.data);
          const adminBytes = ledgerState.admin.is_left
            ? ledgerState.admin.left.bytes
            : ledgerState.admin.right.bytes;
          return {
            rules: ledgerState.rules,
            adminString: toHex(adminBytes),
          };
        })
      );

    console.debug('Deployment fees: ', deployedContract.deployTxData.public.fees);
    return new SentinelContract(providers, deployedContract, state$);
  }

  static async join(
    providers: SentinelContractProviders,
    contractAddress: ContractAddress,
    privateState: PrivateState
  ): Promise<SentinelContract> {
    const deployedContract = await findDeployedContract<SentinelContractType>(providers, {
      contractAddress,
      compiledContract: CompactCompiledContract,
      privateStateId: sentinelContractPrivateStateKey,
      initialPrivateState: privateState,
    });

    const state$ = providers.publicDataProvider
      .contractStateObservable(contractAddress, { type: 'latest' })
      .pipe(
        map((contractState) => {
          const ledgerState = ledger(contractState.data);
          const adminBytes = ledgerState.admin.is_left
            ? ledgerState.admin.left.bytes
            : ledgerState.admin.right.bytes;
          return {
            rules: ledgerState.rules,
            adminString: toHex(adminBytes),
          };
        })
      );

    return new SentinelContract(providers, deployedContract, state$);
  }

  async getCurrentState() {
    let subscription: { unsubscribe: () => void } | null = null;

    subscription = this.state$.subscribe(({ rules, adminString }) => {
      // Ensure we only handle the first emission
      subscription?.unsubscribe();

      console.log('Admin: ', adminString);

      if (rules.isEmpty()) {
        console.log('No rules found');
        return;
      }

      for (const item of rules) {
        console.log('Owner: ', toHex(item[0].bytes));
        console.log('Rules: ', SentinelContract.prettyRules(item[1]));
      }
    });
  }

  async addRule(rule: SentinelRules) {
    const pubKey = this.providers.walletProvider.getCoinPublicKey();
    return await this.deployedContract?.callTx.addRule({ bytes: fromHex(pubKey) }, rule);
  }

  async removeRule(address: string) {
    return await this.deployedContract?.callTx.removeRule({ bytes: fromHex(address) });
  }

  async transferAdmin(newAdmin: Uint8Array) {
    await this.deployedContract?.callTx.transferAdmin({ bytes: newAdmin });
  }

  async mintToken(userInputs: Input[]) {
    const recipient = { bytes: fromHex(this.providers.walletProvider.getCoinPublicKey()) };
    const domainSep = new Uint8Array(32).fill(0);

    // TODO: how to get the rule keys?
    const ruleKeys = userInputs.map((input) => {
      return { bytes: new Uint8Array(32).fill(0) };
    });

    return await this.deployedContract?.callTx.mintSpecialToken(
      userInputs,
      recipient,
      ruleKeys,
      domainSep
    );
  }
}
