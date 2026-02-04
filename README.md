![](readme-header.jpg)

## BTC Locker

A comprehensive Bitcoin staking library for Sundial Protocol, enabling the creation of various timelock scripts to securely lock Bitcoin funds for yield generation, as well yield calculation and distribution utlities for our yield providers.

This library has two main interfaces:

1. **JavaScript/TypeScript Library**: For integration into web applications, Node.js backends, or any JavaScript/TypeScript environment.
2. **Command Line Interface (CLI)**: A user-friendly CLI tool for generating and managing Bitcoin timelock scripts directly from the terminal. This is expected to be most used by yield providers who want to create yield distributions locally.

## Features

- **Simple Timelock Scripts**: Lock funds until a specific date/time
- **Relative Timelock Scripts**: Lock funds for a specific duration from transaction confirmation
- **Dawn Staking Scripts**: Lock and Unlock funds with Sundial Protocol's Dawn staking mechanism
- **Browser & Node.js Compatible**: Works in both environments
- **TypeScript Support**: Full type definitions included
- **Comprehensive Examples**: Ready-to-use examples for all script types

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

## Examples

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
