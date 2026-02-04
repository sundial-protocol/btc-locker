# BTCLocker Modular Architecture

## File Structure

```
src/locker/
├── core.ts           # Core initialization and shared utilities
├── keypair.ts        # Key pair generation functionality
├── timelock.ts       # Simple and relative timelock script creation
├── escrow.ts         # Time-based escrow scripts (dual-party withdrawals)
├── dawn-stake.ts     # Dawn staking script functionality
├── transactions.ts   # Transaction creation and spending
├── yield.ts          # Yield distribution functionality
└── index.ts          # Combined BTCLocker class and exports
```

## Components

### 1. BTCLockerCore (`core.ts`)

- ECC library initialization
- Base class with common functionality
- Timelock validation utilities
- Shared network configuration

### 2. KeyPairGenerator (`keypair.ts`)

- Generate new Bitcoin key pairs
- Create key pairs from existing private keys
- Address derivation

### 3. TimelockScriptCreator (`timelock.ts`)

- Simple timelock scripts (absolute time)
- Relative timelock scripts (CSV)
- Input validation and script compilation

### 4. EscrowManager (`escrow.ts`)

- Time-based escrow scripts with dual-party access
- Before-deadline withdrawals by first party
- After-deadline withdrawals by second party
- Conditional script execution

### 5. DawnStakingManager (`dawn-stake.ts`)
- Dawn staking script creation
- Stake deposit and withdrawal handling

### 6. TransactionManager (`transactions.ts`)
- Spending transaction creation
- Funding transaction creation
- PSBT and raw transaction handling
- Timelock expiry validation

### 7. YieldDistributor (`yield.ts`)

- Yield distribution to timelock addresses
- Change calculation and dust handling
- Transaction metadata and memos

## Usage

### Combined Interface (Backward Compatible)

```javascript
import { createBTCLocker } from "./src/index.js";

const locker = await createBTCLocker("testnet");
await locker.generateKeyPair();
await locker.createTimelockScript(locktime, publicKey);
await locker.createEscrowScript(deadline, beforePubKey, afterPubKey);
await locker.distributeYield(params);
```

### Individual Components (Granular Control)

```javascript
import {
  KeyPairGenerator,
  TimelockScriptCreator,
  EscrowManager,
  YieldDistributor,
} from "./src/locker/index.js";

const keyGen = new KeyPairGenerator(network);
await keyGen.init();
const keyPair = await keyGen.generateKeyPair();

const timelockCreator = new TimelockScriptCreator(network);
await timelockCreator.init();
const script = await timelockCreator.createTimelockScript(locktime, publicKey);

const escrowManager = new EscrowManager(network);
await escrowManager.init();
const escrowScript = await escrowManager.createEscrowScript(deadline, beforePubKey, afterPubKey);
```

## Benefits

1. **Separation of Concerns**: Each file handles a specific functionality
2. **Better Testing**: Individual components can be tested in isolation
3. **Reduced Bundle Size**: Import only needed components
4. **Easier Maintenance**: Changes to one feature don't affect others
5. **Extensibility**: New features can be added as separate modules
6. **Backward Compatibility**: Existing code continues to work with the combined interface

## Migration

Existing code using the BTCLocker class will continue to work without changes. The combined BTCLocker class now delegates to the appropriate modular components internally.

For new development, consider using individual components for better performance and smaller bundle sizes when only specific functionality is needed.
