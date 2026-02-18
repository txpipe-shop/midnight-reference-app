# Midnight Reference App

## Prerequisites

- [Node.js v22.15+](https://nodejs.org/) — `node --version` to check
- [Docker](https://docs.docker.com/get-docker/) with `docker compose` — used for the local proof server, node and indexer
- [pnpm v10.29.3+](https://pnpm.io/) — `pnpm --version` to check. Version 10.29.3 is the only version that I have tested.

## Compact Compiler (v0.28.0)

The Compact compiler converts smart contracts into circuits. The `compact` version manager handles installing and invoking the compiler — you never need to call `compactc` directly.

Install the version manager and compiler:

```bash
# Install the Compact version manager
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/download/compact-v0.4.0/compact-installer.sh | sh

# Add to PATH
source $HOME/.local/bin/env

# Install the compiler version required by this project
compact update 0.28.0

# Verify
compact --version    # expect: compact 0.4.0
compact list         # should show → 0.28.0 as the selected version
```

> **Important**: You do not invoke `compactc` directly. The `compact` version manager finds and runs the correct compiler version for you. All compilation in this project uses `compact compile` via `npm run compact`.

## Setup

1. Go to `apps/cli` and copy the `.env.example` file to `.env`
2. Update the `.env` file with the correct values

```
COMPOSE_DIR=PATH_TO_THE_COMPOSE_DIR
COMPOSE_FILE=PATH_TO_THE_COMPOSE_FILE
```

If you didn't change anything in the repo. The compose file is in the root of the project. Also the compose file is named `compose.yml`.

## Steps to run the CLI

1. `pnpm install` at the root of the project to install the dependencies
2. `pnpm turbo build` on `apps/cli` to build the project
3. `pnpm turbo start` on `apps/cli` to start the project

## FAQ

### I updated the contract, what should I do now?

1. Go to `packages/contract` and check the instructions in the README.md file

## Useful Links

- [Midnight Documentation](https://docs.midnight.network/) — Developer guide
- [Compact Language Guide](https://docs.midnight.network/compact) — Smart contract language reference
