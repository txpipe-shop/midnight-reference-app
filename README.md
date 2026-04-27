# Midnight Sentinel Reference App

A reference implementation of the Sentinel smart contract on the Midnight blockchain, demonstrating delegation, rewards distribution, and dust exchange.
The app aims to solve the problem of DUST capacity by allowing a set of users, the `delegators`, to delegate their NIGHT for DUST generation. In exchange, other users, the `beneficiaries` can ask the app to pay their DUST fees.

## Architecture

```
midnight-reference-app/
├── apps/
│   └── cli/           # Command-line interface for contract interactions
├── packages/
│   ├── api/          # SentinelContract TypeScript wrapper
│   ├── contract/      # Smart contract definition & circuit witnesses
│   └── wallet/       # Wallet SDK integration (HD wallet, balances)
└── ...
```

### Key Components

- **`SentinelContract`** (`packages/api/src/index.ts`): Main class providing `deploy()`, `join()`, `delegate()`, `depositRewards()`, `redeemRewards()`, `mintFreeToken()`, and `withdraw()` methods.

- **`configureProviders`** (`packages/contract/src/providers.ts`): Creates the provider stack connecting wallet, indexer, proof server, and private state storage.

- **Wallet packages**: HD wallet derivation for Zswap (shielded), Dust (fee token), and NightExternal (unshielded) roles.

## Prerequisites

- **Node.js** (v20+)
- **pnpm** (v10.29.3)
- Running Midnight network services:
  - Indexer (default: `http://127.0.0.1:8088`)
  - Node (default: `http://127.0.0.1:9944`)
  - Proof server (default: `http://127.0.0.1:6300`)

## Version Information

Refer to [VERSIONS.md](./VERSIONS.md) for details on working component and dependency versions.

## Installation

In the project's root:

```bash
pnpm install
```

to install all dependencies.

In `apps/cli/`, build all packages:

```bash
pnpm build
```

## Running the CLI

On the project root run:

```bash
docker compose up -d
```

to silently start the docker services: `node`, `indexer` and `proof server`.

### Interactive Menu

Select which wallet to use:

```bash
# Deployer wallet (genesis seed one)
pnpm run dev

# Joiner wallet (genesis seed two)
pnpm run dev-join

# Third wallet (genesis seed three)
pnpm run dev-third
```

Once running, the CLI presents a menu:

```
1. Deploy new contract
2. Join existing contract
3. (Admin) Submit transaction sponsoring DUST
4. Start ZSwap to request DUST sponsorship
5. View balances
6. Exit
```

After selecting deploy or join, a secondary menu allows you to:

1. Delegate NIGHT tokens
2. Redeem rewards
3. Withdraw funds
4. Deposit rewards
5. View current state
6. Return to main menu

A more in-depth explanation on the cli and its usage can be found in the respective [readme](./apps/cli/README.md).

## Configuration

Default endpoints are hardcoded in `apps/cli/src/config.ts` (`StandaloneConfig` class). Modify the following properties to connect to different networks:

```typescript
indexer: 'http://127.0.0.1:8088/api/v3/graphql',
indexerWS: 'ws://127.0.0.1:8088/api/v3/graphql/ws',
node: 'http://127.0.0.1:9944',
proofServer: 'http://127.0.0.1:6300',
```

Wallet seeds are defined in `apps/cli/src/utils/constants.ts` for the three default wallets.

## Current limitations

At the time of writing (27-04-2026):

- deposits/withdrawals of unshielded tokens in contracts is not working, so the app is implemented using shielded tokens, which cannot be registered for DUST generation
- transaction building from scratch is difficult and even more so if it includes interactions with contracts, in an ideal implementation the Admin account wouldn't need to withdraw the NIGHTs nor deposit the rewards, because token transfers could be handled directly with the contract and the admin would only need to provide their DUST key.
