# Midnight Reference App

## Prerequisites

- [Node.js v22.15+](https://nodejs.org/) — `node --version` to check
- [Docker](https://docs.docker.com/get-docker/) with `docker compose` — used for the local proof server, node and indexer
- [pnpm v10.29.3+](https://pnpm.io/) — `pnpm --version` to check. Version 10.29.3 is the only version that I have tested.

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

1. Go to `packages/contract` and run `pnpm compact` to compile the contract
2. TODO: Add instructions to update the types in the contract package
