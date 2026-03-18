![](readme-header.jpg)

## BTC Locker

A comprehensive Bitcoin staking library for Sundial Protocol, enabling the creation of various timelock scripts to securely lock Bitcoin funds for yield generation, as well yield calculation and distribution utlities for our yield providers.

This library has two main interfaces:

1. **JavaScript/TypeScript Library (`/src`)**: For integration into web applications, Node.js backends, or any JavaScript/TypeScript environment.

2. **Command Line Interface (`/bin`)**: A user-friendly CLI tool built in Javascript for interacting with the Javascript library directly from the terminal.

And several auxiliary tools to help test & demonstrate usage:

1. **Javascript unit tests (`/tests`)**: Vitest unit tests used to verify the correctness & stability of the Javascript Library.

2. **Demo server (`/demo`)**: A multipurpose demo server that is used for validating bundle testing,  running interactive documentation locally, and demonstrating how to use the Javascript library in a browser environment.

3. **JSDocs (`/docs`)**: A .gitignored folder that includes all generated JSDocs. Run `npm run docs` to generate the latest documentation for your local demo.

4. **Test Coverage (`/coverage`)**: Another .gitignored folder. If you're looking for a full report on test coverage here is where to go. Run `npm run test:coverage`. 

## Features

- **Construct Scripts**: Create various timelock scripts (absolute, relative, escrow) for locking Bitcoin funds.
- **Build Transactions**: Construct transactions to fund timelock scripts, spend from them, and distribute yield.
- **Browser & Node.js Compatible**: Works in both environments
- **TypeScript Support**: Full type definitions included
- **Modular Architecture**: Import only what you need — standalone functions, individual managers, or the combined `BTCLocker` class

## Installation

This package sits in a private GitHub Package Registry. To install, first set up your `.env` with an authorized github token to be used by `.npmrc`:

```bash
NODE_AUTH_TOKEN=ghp_yourgithubtokenhere
```

Then install via npm:

```bash
npm install @sundial-protocol/btc-locker
```

For browser usage, you can also include the bundled version:

```html
<script src="node_modules/btc-locker/dist/btc-locker.bundle.js"></script>
```

## Quick Start

### Basic Timelock Example

```javascript
import { createBTCLocker, TimeUtils } from "@sundial-protocol/btc-locker";

// Initialize the locker
const locker = await createBTCLocker("testnet");

// Generate a key pair
const keyPair = await locker.generateKeyPair();

// Create a timelock script (lock for 1 week)
const locktime = TimeUtils.addDuration(TimeUtils.DURATIONS.WEEK);
const script = await locker.createTimelockScript(locktime, keyPair.publicKey);

console.log("Send Bitcoin to:", script.address);
console.log("Funds locked until:", new Date(locktime * 1000));
```

## Architecture

The library is organized into standalone per-file functions grouped under `src/locker/scripts/` and `src/locker/transactions/`, with thin facade classes (`ScriptManager`, `SundialTransactionManager`) that can be used independently or through the combined `BTCLocker` class.

See [src/locker/README.md](src/locker/README.md) for a full breakdown of the internal structure, the `LockerContext` pattern, and examples of using individual managers or standalone functions directly.

## API Documentation

Detailed API documentation is available in the [Docs Directory](docs/). You can generate the latest docs by running:

```bash
npm run docs
```

You can also run a documentation server for them at `http://localhost:3000/docs` with:

```bash
npm start
```

## Command Line Interface (CLI)

The package includes a CLI tool for interacting with the same endpoints exposed in the JS library.

More details can be found in the [CLI Documentation](CLI.md), including a full E2E walkthrough of a staking flow.

## 🧪 Testing

```bash
npm test
```

## Development

```bash
# Install dependencies
npm install

# Build for browser
npm run build

# Run linting
npm run lint

# Generate documentation
npm run docs

# Run documentation server / browser tests
npm start
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- [GitHub Repository](https://github.com/sundial-protocol/btc-locker)

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/sundial-protocol/btc-locker/issues) on GitHub.
