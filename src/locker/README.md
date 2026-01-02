# BTCLocker Modular Architecture

The BTCLocker library has been refactored into a modular architecture for better organization, maintainability, and flexibility. Each major functionality is now in its own dedicated file.

## File Structure

```
src/locker/
├── core.js           # Core initialization and shared utilities
├── keypair.js        # Key pair generation functionality
├── timelock.js       # Simple and relative timelock script creation
├── multisig.js       # Multisig timelock script creation
├── hodl.js           # HODL script with emergency escape
├── transactions.js   # Transaction creation and spending
├── yield.js          # Yield distribution functionality
└── index.js          # Combined BTCLocker class and exports
```

## Components

### 1. BTCLockerCore (`core.js`)

- ECC library initialization
- Base class with common functionality
- Timelock validation utilities
- Shared network configuration

### 2. KeyPairGenerator (`keypair.js`)

- Generate new Bitcoin key pairs
- Create key pairs from existing private keys
- Address derivation

### 3. TimelockScriptCreator (`timelock.js`)

- Simple timelock scripts (absolute time)
- Relative timelock scripts (CSV)
- Input validation and script compilation

### 4. MultisigTimelockCreator (`multisig.js`)

- M-of-N multisig timelock scripts
- Public key management
- Multisig script compilation

### 5. HodlScriptCreator (`hodl.js`)

- HODL scripts with emergency escape
- Conditional script paths
- Owner and penalty key management

### 6. TransactionManager (`transactions.js`)

- Spending transaction creation
- Funding transaction creation
- PSBT and raw transaction handling
- Timelock expiry validation

### 7. YieldDistributor (`yield.js`)

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
await locker.distributeYield(params);
```

### Individual Components (Granular Control)

```javascript
import {
  KeyPairGenerator,
  TimelockScriptCreator,
  YieldDistributor,
} from "./src/locker/index.js";

const keyGen = new KeyPairGenerator(network);
await keyGen.init();
const keyPair = await keyGen.generateKeyPair();

const timelockCreator = new TimelockScriptCreator(network);
await timelockCreator.init();
const script = await timelockCreator.createTimelockScript(locktime, publicKey);
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
