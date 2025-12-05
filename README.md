# BTC Locker 🔒

A comprehensive Bitcoin timelock script library for creating and managing time-locked transactions. This library provides easy-to-use functions for creating various types of Bitcoin locking scripts including simple timelocks, multisig timelocks, relative timelocks, and HODL scripts with emergency escape mechanisms.

## 🚀 Features

- **Simple Timelock Scripts**: Lock funds until a specific date/time
- **Relative Timelock Scripts**: Lock funds for a specific duration from transaction confirmation
- **Multisig Timelock Scripts**: Require multiple signatures + timelock
- **HODL Scripts**: Long-term locking with emergency escape mechanism
- **Browser & Node.js Compatible**: Works in both environments
- **TypeScript Support**: Full type definitions included
- **Comprehensive Examples**: Ready-to-use examples for all script types

## 📦 Installation

```bash
npm install btc-locker
```

For browser usage, you can also include the bundled version:

```html
<script src="node_modules/btc-locker/dist/btc-locker.bundle.js"></script>
```

## 🔧 Quick Start

### Basic Timelock Example

```javascript
const { BTCLocker, TimeUtils } = require("btc-locker");

// Initialize the locker
const locker = new BTCLocker();

// Generate a key pair
const keyPair = locker.generateKeyPair();

// Create a timelock script (lock for 1 week)
const locktime = TimeUtils.addDuration(TimeUtils.DURATIONS.WEEK);
const script = locker.createTimelockScript(locktime, keyPair.publicKey);

console.log("Send Bitcoin to:", script.address);
console.log("Funds locked until:", new Date(locktime * 1000));
```

### Multisig Timelock Example

```javascript
// Generate multiple key pairs
const keyPair1 = locker.generateKeyPair();
const keyPair2 = locker.generateKeyPair();
const keyPair3 = locker.generateKeyPair();

// Create 2-of-3 multisig timelock (lock for 1 month)
const locktime = TimeUtils.addDuration(TimeUtils.DURATIONS.MONTH);
const publicKeys = [keyPair1.publicKey, keyPair2.publicKey, keyPair3.publicKey];
const multisigScript = locker.createMultisigTimelockScript(
  locktime,
  2,
  publicKeys
);

console.log("2-of-3 Multisig address:", multisigScript.address);
```

## 📚 API Documentation

### BTCLocker Class

#### `new BTCLocker(network?)`

Creates a new BTCLocker instance.

- `network`: Bitcoin network (default: mainnet)

#### `createTimelockScript(locktime, publicKey)`

Creates a simple timelock script.

- `locktime`: Unix timestamp or block height
- `publicKey`: Public key (hex string or Buffer)
- Returns: Script information object

#### `createRelativeTimelockScript(sequence, publicKey)`

Creates a relative timelock script.

- `sequence`: Number of blocks to lock
- `publicKey`: Public key (hex string or Buffer)
- Returns: Script information object

#### `createMultisigTimelockScript(locktime, m, publicKeys)`

Creates a multisig timelock script.

- `locktime`: Unix timestamp or block height
- `m`: Required number of signatures
- `publicKeys`: Array of public keys
- Returns: Script information object

#### `createHodlScript(locktime, ownerPubKey, penaltyPubKey)`

Creates a HODL script with emergency escape.

- `locktime`: Unix timestamp or block height
- `ownerPubKey`: Owner's public key
- `penaltyPubKey`: Emergency contact's public key
- Returns: Script information object

### TimeUtils Class

#### Static Methods

- `dateToTimestamp(date)`: Convert Date to Unix timestamp
- `timestampToDate(timestamp)`: Convert Unix timestamp to Date
- `addDuration(duration, baseTime?)`: Add duration to timestamp
- `blocksToSeconds(blocks, blockTime?)`: Convert blocks to seconds

#### Constants

```javascript
TimeUtils.DURATIONS = {
  MINUTE: 60,
  HOUR: 3600,
  DAY: 86400,
  WEEK: 604800,
  MONTH: 2592000,
  YEAR: 31536000,
};
```

### TransactionUtils Class

#### Static Methods

- `estimateFee(inputs, outputs, feeRate?)`: Estimate transaction fee
- `satoshisToBTC(satoshis)`: Convert satoshis to BTC
- `btcToSatoshis(btc)`: Convert BTC to satoshis

## 🔐 Script Types

### 1. Simple Timelock

Locks funds until a specific timestamp. Only the key holder can spend after expiry.

```
<locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP <pubkey> OP_CHECKSIG
```

### 2. Relative Timelock

Locks funds for a specific number of blocks from confirmation.

```
<sequence> OP_CHECKSEQUENCEVERIFY OP_DROP <pubkey> OP_CHECKSIG
```

### 3. Multisig Timelock

Requires multiple signatures AND timelock expiry.

```
<locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP <m> <pubkey1> ... <pubkeyn> <n> OP_CHECKMULTISIG
```

### 4. HODL Script

Normal unlock after timelock OR emergency unlock with multiple signatures.

```
OP_IF
    <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP <owner_pubkey> OP_CHECKSIG
OP_ELSE
    2 <owner_pubkey> <penalty_pubkey> 2 OP_CHECKMULTISIG
OP_ENDIF
```

## 🖥️ Command Line Interface (CLI)

The package includes a powerful CLI for testing and managing Bitcoin timelock scripts:

### Installation & Setup

```bash
npm install -g btc-locker
# or run locally:
npm run cli
```

### Basic Commands

```bash
# Generate a new key pair (testnet by default)
btc-locker keygen

# Generate mainnet key pair
btc-locker --network mainnet keygen

# Create a timelock script
btc-locker timelock --time 1765064511 --pubkey 02eb121c6fc...

# Create multisig timelock
btc-locker multisig --time 1765064511 --required 2 --pubkeys "02eb121c...,03f9308a...,03c6047f..."

# Create HODL script with emergency escape
btc-locker hodl --time 1765064511 --owner 02eb121c... --emergency 03f9308a...

# Check if timelock has expired
btc-locker check --time 1765064511

# Interactive mode
btc-locker interactive
```

### Utility Commands

```bash
# Validate keys
btc-locker utils validate-key 02eb121c6fc425e894a936c87367c3f1871170af9e131cc2aa598d6ae4ee4a1cbe

# Convert time formats
btc-locker utils time 1765064511
btc-locker utils time "1 week"
```

### CLI Options

- `--network <mainnet|testnet>`: Choose Bitcoin network (default: testnet)
- `--json`: Output results in JSON format
- `--verbose`: Enable verbose logging

### Examples

```bash
# Create a 1-week timelock on testnet
btc-locker timelock --time $(node -e "console.log(Math.floor(Date.now()/1000) + 604800)") --pubkey $(btc-locker keygen --json | jq -r .publicKey)

# Check timelock status
btc-locker check --time 1765064511

# Get help
btc-locker --help
btc-locker timelock --help
```

```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://unpkg.com/btc-locker/dist/btc-locker.bundle.js"></script>
  </head>
  <body>
    <script>
      const { BTCLocker, TimeUtils } = window.BTCLocker;

      const locker = new BTCLocker();
      const keyPair = locker.generateKeyPair();

      // Create a 1-day timelock
      const locktime = TimeUtils.addDuration(TimeUtils.DURATIONS.DAY);
      const script = locker.createTimelockScript(locktime, keyPair.publicKey);

      console.log("Timelock address:", script.address);
    </script>
  </body>
</html>
```

## 📁 Examples

Check the `examples/` directory for comprehensive usage examples:

- `basic-usage.js`: Basic timelock examples
- `advanced-usage.js`: Advanced scenarios and spending flows

Run examples:

```bash
npm run example
```

## 🧪 Testing

```bash
npm test
```

## 🔨 Development

```bash
# Install dependencies
npm install

# Build for browser
npm run build

# Run linting
npm run lint

# Generate documentation
npm run docs
```

## ⚠️ Important Security Notes

1. **Testnet First**: Always test on Bitcoin testnet before using on mainnet
2. **Key Security**: Keep private keys secure - losing them means losing access to funds
3. **Time Validation**: Verify locktime calculations are correct before deploying
4. **Fee Planning**: Account for network fees when creating spending transactions
5. **Script Verification**: Double-check script addresses and parameters

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🔗 Links

- [GitHub Repository](https://github.com/sundial-protocol/btc-locker)
- [NPM Package](https://www.npmjs.com/package/btc-locker)
- [Documentation](https://sundial-protocol.github.io/btc-locker/)

## 🆘 Support

If you encounter any issues or have questions, please [open an issue](https://github.com/sundial-protocol/btc-locker/issues) on GitHub.
