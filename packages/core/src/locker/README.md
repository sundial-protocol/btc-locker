# BTCLocker Modular Architecture

## File Structure

```
src/locker/
├── core.ts                        # Base class, ECC init, LockerContext interface
├── keypair.ts                     # Thin facade → scripts/keypair (not yet split)
├── script-manager.ts              # Facade: all script creation (timelock + escrow)
├── transaction-manager.ts         # Facade: all transaction construction
├── index.ts                       # Combined BTCLocker class and barrel exports
├── scripts/                       # Standalone script creation functions
│   ├── timelock.ts                # createTimelockScript, createRelativeTimelockScript
│   ├── escrow.ts                  # createEscrowScript, EscrowSpendingSigningParams
│   └── index.ts                   # Barrel
└── transactions/                  # Standalone transaction construction functions
    ├── generic.ts                 # createSpendingTransaction, createFundingTransaction
    ├── claim.ts         # createClaimTransaction
    ├── withdrawal.ts         # createWithdrawalTransaction
    ├── distribute.ts      # createDistributionTransaction
    ├── index.ts                   # Barrel
    └── deposit/
        ├── deposit.ts               # createDepositTransaction
        ├── deposit-with-script.ts   # createDepositTransactionWithScript
        └── calculate.ts          # calculateDepositAmounts
```

## Architecture Pattern

All logic lives in small per-file standalone functions that accept a `LockerContext` as their first argument:

```typescript
export interface LockerContext {
  network: bitcoin.Network;
  api: BitcoinAPI;
}
```

`BTCLockerCore` satisfies `LockerContext` (it exposes `network` and `api` publicly), so facade classes pass `this` directly.

Facade classes (`ScriptManager`, `SundialTransactionManager`, `TransactionManager`) extend `BTCLockerCore`, call `ensureInitialized()`, then delegate to the standalone function:

```typescript
async createTimelockScript(locktime: number, publicKey: Buffer | string) {
  await this.ensureInitialized();
  return createTimelockScript(this, locktime, publicKey);
}
```

## Components

### `core.ts` — BTCLockerCore + LockerContext

- ECC library initialization (`initEccLib`)
- `ensureInitialized()` guard used by all facades
- `signTransaction()` / `submitTransaction()` shared helpers
- `LockerContext` interface

### `keypair.ts` — KeyPairGenerator

- Generate new Bitcoin key pairs
- Create key pairs from existing private keys

### `script-manager.ts` — ScriptManager

Thin facade combining both script creation functions:

- `createTimelockScript(locktime, publicKey)` → `scripts/timelock.ts`
- `createRelativeTimelockScript(sequence, publicKey)` → `scripts/timelock.ts`
- `createEscrowScript(deadline, beforeKey, afterKey)` → `scripts/escrow.ts`

### `transaction-manager.ts` — SundialTransactionManager

Thin facade over all transaction construction functions:

- `createSpendingTransaction` / `createFundingTransaction` → `transactions/generic.ts`
- `createClaimTransaction` → `transactions/claim.ts`
- `createWithdrawalTransaction` → `transactions/withdrawal.ts`
- `createDistributionTransaction` → `transactions/distribute.ts`
- `createDepositTransaction` → `transactions/staking/deposit.ts`
- `createDepositTransactionWithScript` → `transactions/staking/deposit-with-script.ts`
- `calculateDepositAmounts` → `transactions/staking/calculate.ts`

### `index.ts` — BTCLocker (combined facade)

Composes all managers into a single backward-compatible class. Each public method delegates to the appropriate manager. Also re-exports all component classes and types.

## Usage

### Combined Interface (Backward Compatible)

```javascript
import { createBTCLocker } from "./src/index.js";

const locker = await createBTCLocker("testnet");
const keyPair = await locker.generateKeyPair();
const script = await locker.createTimelockScript(locktime, publicKey);
const escrow = await locker.createEscrowScript(deadline, beforeKey, afterKey);
const tx = await locker.createDepositTransaction(params);
```

### Individual Managers (Granular Control)

```javascript
import {
  ScriptManager,
  SundialTransactionManager,
} from "./src/locker/index.js";

const scripts = new ScriptManager(network);
await scripts.init();
const timelockScript = await scripts.createTimelockScript(locktime, publicKey);
const escrowScript = await scripts.createEscrowScript(
  deadline,
  beforeKey,
  afterKey,
);

const txManager = new SundialTransactionManager(network);
await txManager.init();
const unsignedPsbt = await txManager.createDepositTransaction(params);
```

### Standalone Functions (Minimal / Tree-shakeable)

```javascript
import { createTimelockScript } from "./src/locker/scripts/timelock.js";
import { createDepositTransaction } from "./src/locker/transactions/staking/deposit.js";

const script = await createTimelockScript(ctx, locktime, publicKey);
const tx = await createDepositTransaction(ctx, params);
```

## Benefits

1. **Single Responsibility**: Each file owns exactly one concern
2. **Context Pattern**: No class inheritance needed for business logic — functions receive `LockerContext`
3. **Tree-shakeable**: Import only the functions you need
4. **Testable in Isolation**: Standalone functions can be tested by passing a mock context
5. **Backward Compatible**: `BTCLocker` combined class continues to work unchanged
