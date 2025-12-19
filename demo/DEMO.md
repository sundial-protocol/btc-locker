# BTC Locker Demo Server

A comprehensive demo server for the BTC Locker Bitcoin timelock library, featuring a web-based UI that uses the browser bundle for all Bitcoin operations.

## Quick Start

### Option 1: Auto Setup (Recommended)

```bash
node start-demo.js
```

This will automatically:

- Install any missing dependencies (express)
- Build the browser bundle if needed
- Start the demo server on http://localhost:3000

### Option 2: Manual Setup

```bash
# Install dependencies
npm install express

# Build the browser bundle
npm run build

# Start the demo server
npm run demo
```

### Option 3: Development Mode

```bash
# Install nodemon for auto-restart
npm install -g nodemon

# Run in development mode
npm run demo:dev
```

## Demo Features

### 🌐 Web Interface

- **Main Demo**: http://localhost:3000
- Interactive Bitcoin timelock script testing using browser bundle
- Client-side transaction creation and signing
- Real-time blockchain interaction (testnet/mainnet)
- **Browser Bundle**: http://localhost:3000/dist/btc-locker.bundle.js

### 📚 Documentation

- **CLI Documentation**: http://localhost:3000/cli
- **Example Scripts**: http://localhost:3000/examples/basic-usage.js
- **Bundle Info**: http://localhost:3000/api/bundle-info

## Browser Bundle Usage

The demo uses the BTC Locker browser bundle which exposes the following APIs:

```javascript
// Load the bundle
<script src="/dist/btc-locker.bundle.js"></script>;

// Access the library
const { BTCLocker, TimeUtils, ScriptUtils, TransactionUtils } =
  window.BTCLocker;

// Create timelock scripts
const locker = new BTCLocker("testnet");
const script = locker.createTimelockScript(publicKey, locktime);

// Generate key pairs
const keyPair = locker.generateKeyPair();

// Create spending transactions
const tx = locker.createSpendingTransaction(
  privateKey,
  redeemScript,
  utxos,
  destinationAddress,
  amount,
  locktime
);

// Distribute yield
const result = await locker.distributeYield(
  fromPrivateKey,
  fromAddress,
  timelockAddress,
  yieldAmount,
  memo
);
```

## Demo Scenarios

### 1. Basic Timelock Creation

1. Visit http://localhost:3000
2. Use the browser interface to generate key pairs
3. Create timelock scripts with future timestamps
4. All operations happen client-side using the browser bundle

### 2. Advanced Timelock Testing

1. Test different locktime formats (UNIX timestamps, relative times)
2. Generate and verify redeem scripts
3. Export timelock addresses for funding

### 3. Transaction Creation

1. Create spending transactions after locktime expiry
2. Sign transactions client-side
3. Export transaction hex for broadcasting

## Browser Bundle Architecture

The demo leverages the BTC Locker browser bundle which:

- Runs entirely in the browser (no server-side Bitcoin operations)
- Includes all necessary Bitcoin libraries (bitcoinjs-lib, etc.)
- Provides the same API as the Node.js version
- Supports both testnet and mainnet
- Handles all cryptographic operations client-side

## Environment Configuration

The demo server supports the following environment variables:

```bash
# Server configuration
PORT=3000                    # Server port (default: 3000)
NODE_ENV=demo               # Environment mode
```

## Development

The demo server is built with:

- **Express.js** - Web framework for serving static files
- **BTC Locker Bundle** - Client-side Bitcoin functionality
- **Static File Serving** - For demo.html and bundle assets
- **CORS Support** - For browser-based testing

### File Structure

```
├── demo-server.js          # Simple static file server
├── start-demo.js           # Auto-setup script
├── demo.html               # Web interface using bundle
├── dist/                   # Browser bundle
│   └── btc-locker.bundle.js
├── src/                    # Source library
└── examples/               # Usage examples
```

## Security Notes

✅ **Enhanced Security with Browser Bundle**

- All private key operations happen client-side
- No server-side private key handling
- Transactions are created and signed in the browser
- Server only serves static files

⚠️ **Testing Guidelines**

- Always use testnet for development and testing
- Never use real mainnet private keys in demos
- Browser console may contain sensitive information during development

## Troubleshooting

### Common Issues

**Bundle not found:**

```bash
npm run build
```

**Port already in use:**

```bash
PORT=3001 node start-demo.js
```

**Bundle outdated:**

```bash
npm run build:dev
```

### Bundle Information

Check bundle status:

```bash
curl http://localhost:3000/api/bundle-info
```

### Getting Help

- Check browser console for detailed error messages
- Visit http://localhost:3000/api/bundle-info for bundle status
- Review the CLI documentation at http://localhost:3000/cli
- Inspect the browser bundle at http://localhost:3000/dist/btc-locker.bundle.js

## Browser Testing

The bundle can be tested directly in browser console:

```javascript
// After loading the demo page
const { BTCLocker } = window.BTCLocker;
const locker = new BTCLocker("testnet");
const keyPair = locker.generateKeyPair();
console.log("Generated key pair:", keyPair);

// Create a timelock for 1 hour from now
const locktime = Math.floor(Date.now() / 1000) + 3600;
const script = locker.createTimelockScript(keyPair.publicKey, locktime);
console.log("Timelock script:", script);
```
