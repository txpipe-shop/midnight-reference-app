# Sentinel CLI

This package provides an interactive command-line interface (CLI) to test and interact with the `SentinelContract`.

## Overview

The `apps/cli` application allows you to spin up a local standalone Midnight network environment (using test containers for the node, indexer, and proof server), synchronize a wallet, and interact with the ZK contract through a guided terminal menu.

## Features

- **Local Network Support**: Automatically spins up necessary Docker containers for local Midnight testing via `@midnight-sentinel/containers` and testcontainers.
- **Contract Deployment**: Deploys a new `SentinelContract` onto the network with a predefined set of rules.
- **Contract Joining**: Allows joining an already deployed contract by entering its contract address.
- **Token Minting**: Once a contract is deployed or joined, the CLI provides an option to execute the `mintSpecialToken` circuit. It gathers the required input from the user to satisfy the contract's rules and attempts to mint the token unshielded.

## Usage

You can run the CLI directly from source in development mode:

```bash
pnpm install
pnpm turbo build
pnpm run dev
```

### Menu Flow

When starting the CLI, you will be presented with the main menu:

1. **Deploy contract**: Deploys a new `SentinelContract` and displays its network address.
2. **Join contract**: Prompts for a contract address to attach to an existing deployment.
3. **Exit**: Gracefully shuts down containers and exits.

After deploying or joining a contract, you have access to the circuit menu:

1. **Mint Token**: Prompts for a numeric input. The CLI constructs the transaction invoking `mintSpecialToken` passing the input to see if it satisfies the contract rules. If successful, you will receive a transaction hash.
