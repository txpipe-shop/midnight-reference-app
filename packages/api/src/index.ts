import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { fromHex } from '@midnight-ntwrk/compact-runtime';
import {
  CompactCompiledContract,
  sentinelContractPrivateStateKey,
  type ContractAddress,
  type SentinelContractDeployed,
  type SentinelContractProviders,
  type SentinelContractType,
  type Rules as SentinelRules,
  type PrivateState,
  pureCircuits,
  ledger,
  Proposition,
  BooleanProp,
} from '@midnight-sentinel/contract';
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

export interface SentinelDerivedState {
  rules: SentinelRules;
  ownerString: string;
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
    privateState: PrivateState,
    rules: SentinelRules
  ): Promise<SentinelContract> {
    const deployedContract = await deployContract<SentinelContractType>(providers, {
      compiledContract: CompactCompiledContract,
      privateStateId: sentinelContractPrivateStateKey,
      initialPrivateState: privateState,
      args: [
        rules,
        new Uint8Array(32).fill(0),
        {
          bytes: fromHex(providers.walletProvider.getCoinPublicKey()),
        },
      ],
    });

    const contractAddress = deployedContract.deployTxData.public.contractAddress;
    const state$ = providers.publicDataProvider
      .contractStateObservable(contractAddress, { type: 'latest' })
      .pipe(
        map((contractState) => {
          const ledgerState = ledger(contractState.data);
          const ownerBytes = ledgerState.owner.is_left
            ? ledgerState.owner.left.bytes
            : ledgerState.owner.right.bytes;
          return {
            rules: ledgerState.rules,
            ownerString: toHex(ownerBytes),
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
          const ownerBytes = ledgerState.owner.is_left
            ? ledgerState.owner.left.bytes
            : ledgerState.owner.right.bytes;
          return {
            rules: ledgerState.rules,
            ownerString: toHex(ownerBytes),
          };
        })
      );

    return new SentinelContract(providers, deployedContract, state$);
  }

  async mintToken(uint: bigint, nullifierFill: number, address: Uint8Array) {
    const nullifier = pureCircuits.nullifier(new Uint8Array(32).fill(nullifierFill));
    const tx = await this.deployedContract?.callTx.mintSpecialToken(
      {
        nullifier,
        boolean: true,
        bytes32: new Uint8Array(32).fill(0),
        field: 12312312312n,
        uint,
      },
      { bytes: address }
    );

    return tx;
  }
}
