# Sentinel Contract

This package contains the `SentinelContract`, a DUST sponsorship contract written in Midnight's [Compact](https://docs.midnight.network/develop/tutorial/building/compact) smart contract language.

## Overview

The `SentinelContract` allows users to delegate NIGHTs that are used by a known address to generate DUST. In turn, other users can get their DUST fees paid for in exchange for other tokens. These other tokens can be redeemed by delegators as a reward.

## Structure

- **`sentinel.compact`**: The core smart contract logic.
  - Defines the ledger state
  - Defines circuits:
    - `delegate`: allows a user to delegate an amount of Nights. A hash of their secret key is stored along with the amount delegated, for future reward distribution.

## Usage

This package is intended to be used by frontends or CLI tools (like `apps/cli` in this workspace) to interact with the deployed `SentinelContract` on the Midnight network.
