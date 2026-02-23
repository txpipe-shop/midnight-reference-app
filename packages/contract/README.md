# Sentinel Contract

This package contains the `SentinelContract`, a rule-based token minting contract written in Midnight's [Compact](https://docs.midnight.network/develop/tutorial/building/compact) smart contract language.

## Overview

The `SentinelContract` allows users to mint a special token if they can provide an `Input` that satisfies the pre-configured `Rules` of the contract.

The rules are evaluated on the provided input before allowing the `mintSpecialToken` circuit to proceed. If the rules are met, the contract unshielded-mints 1 token to the specified user address.

## Structure

- **`sentinel.compact`**: The core smart contract logic.
  - Defines the `Input` structure (containing a `uint`, `boolean`, `bytes32`, `field`, and `nullifier`).
  - Defines data structures for `Proposition`, `Conjunction`, and `Rules` representing complex boolean logic (specifically, a Disjunctive Normal Form up to 2 ORs of 2 ANDs).
  - The `mintSpecialToken` circuit evaluates `satisfies(input)` before minting.
- **Typescript Bindings**: The package also exposes the Compact-generated typescript types and the configured `SentinelContract` ready to be deployed or interacted with via `@midnight-ntwrk/midnight-js-contracts`.
  - `index.ts`: Main entry point exposing the compiled contract, providers, and witnesses.
  - `types.ts`: TypeScript type definitions matching the contract state and circuits.
  - `providers.ts`: Configuration for contract providers and zkConfig.

## Usage

This package is intended to be used by frontends or CLI tools (like `apps/cli` in this workspace) to interact with the deployed `SentinelContract` on the Midnight network. By supplying an `Input` that logically satisfies the `Rules` set at deployment, a client can successfully call the `mintSpecialToken` circuit.
