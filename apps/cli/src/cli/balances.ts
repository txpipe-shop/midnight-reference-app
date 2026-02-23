import type { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import * as Rx from 'rxjs';

interface Balances {
  dust: bigint;
  shielded: Record<string, bigint>;
  unshielded: Record<string, bigint>;
}

const DIVIDER = '──────────────────────────────────────────────────────────────';

export async function getBalances(wallet: WalletFacade): Promise<Balances> {
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  return { dust: state.dust.walletBalance(new Date()), shielded: state.shielded.balances, unshielded: state.unshielded.balances };
}

export function printBalances(balances: Balances) {
  const prettyShielded = Object.entries(balances.shielded).map(([token, balance]) => `${token}: ${balance}`);
  const prettyUnshielded = Object.entries(balances.unshielded).map(([token, balance]) => `${token}: ${balance}`);

  console.log(`${DIVIDER}
BALANCES
${DIVIDER}
* Dust: ${balances.dust}

* Shielded: 
\t${prettyShielded.join('\n\t')}

* Unshielded: 
\t${prettyUnshielded.join('\n\t')}
${DIVIDER}`);
}