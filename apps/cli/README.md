# Sentinel CLI

Interactive command-line interface for testing and interacting with the `SentinelContract` on Midnight network.

## Overview

The CLI provides a menu-driven interface to:

- Deploy or join Sentinel contracts
- Manage delegations and rewards
- Execute ZSwap transactions with DUST sponsorship
- Check wallet balances and contract state

## Prerequisites

- Node.js >= 22
- pnpm
- Running Midnight network (standalone or remote)

## Usage

### Development Mode

Select which wallet to use:

```bash
# Deployer wallet (genesis seed one)
pnpm run dev

# Joiner wallet (genesis seed two)
pnpm run dev-join

# Third wallet (genesis seed three)
pnpm run dev-third
```

## Main Menu Options

1. **Deploy a new contract** - Deploys a fresh SentinelContract and displays the contract address
2. **Join an existing contract** - Connect to an existing contract by providing its address
3. **(Admin) Submit transaction sponsoring DUST** - Submit a serialized transaction for DUST fee sponsorship
4. **Start ZSwap to request DUST sponsorship** - Initiate a shielded token swap (outputs hex-serialized transaction)
5. **Get balances** - Display wallet balances (shielded/unshielded)
6. **Exit** - Quit the CLI

## Circuit Menu Options (After Deploy/Join)

1. **Delegate NIGHT** - Delegate NIGHT tokens by providing amount
2. **Redeem rewards** - Claim accumulated delegation rewards
3. **(Admin) Withdraw NIGHTs** - Admin function to withdraw delegated tokens
4. **(Admin) Deposit rewards** - Admin function to deposit reward tokens
5. **Get contract state** - View current contract state (owner, delegators, vaults)
6. **Exit** - Return to main menu

## ZSwap Workflow

The ZSwap feature enables atomic token swaps with DUST sponsorship:

### Step 1: Start ZSwap to request DUST sponsorship (Option 4 in main menu)

- Enter token type (shielded token color)
- Enter amount to swap
- Enter receiver's shielded address
- Returns hex-encoded serialized transaction

### Step 2: (Admin) Submit transaction sponsoring DUST (Option 3 in main menu)

- Paste the hex-encoded transaction from step 1
- Admin wallet balances the transaction and pays DUST fees
- Transaction is submitted to the network

**Note:** These two operations typically run in different wallet contexts - the swap initiator (who doesn't pay fees) and the sponsor (who pays DUST fees).
