![](readme-header.jpg)

## BTC Locker

A comprehensive Bitcoin staking library for Sundial Protocol, enabling the creation of various timelock scripts to securely lock Bitcoin funds for yield generation, as well as yield calculation and distribution utilities for our yield providers.

This is a **Turborepo monorepo** containing the following packages under `packages/`:

1. **`packages/core` (`@sundial-protocol/btc-locker`)**: The core TypeScript library for integration into web applications, Node.js backends, or any JavaScript/TypeScript environment.

2. **`packages/cli` (`@sundial-protocol/btc-locker-cli`)**: A user-friendly CLI tool for interacting with the core library directly from the terminal.

3. **`packages/demo` (`@sundial-protocol/btc-locker-demo`)**: A multipurpose demo server used for running interactive documentation locally and demonstrating how to use the library.

4. **`packages/btc-api`**: Bitcoin API integration package.

And several auxiliary tools to help test & demonstrate usage:

1. **Vitest unit tests (`packages/core/tests/`)**: Unit tests used to verify the correctness & stability of the core library.

2. **JSDocs (`packages/core/docs/`)**: A .gitignored folder that includes all generated JSDocs. Run `npm run docs` to generate the latest documentation for your local demo.

3. **Test Coverage (`coverage/`)**: Another .gitignored folder. If you're looking for a full report on test coverage here is where to go. Run `npm run test:coverage`.

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

The core library (`packages/core`) is organized into standalone per-file functions grouped under `src/locker/scripts/` and `src/locker/transactions/`, with thin facade classes (`ScriptManager`, `SundialTransactionManager`) that can be used independently or through the combined `BTCLocker` class.

See [packages/core/src/locker/README.md](packages/core/src/locker/README.md) for a full breakdown of the internal structure, the `LockerContext` pattern, and examples of using individual managers or standalone functions directly.

## API Documentation

Detailed API documentation is available in the [Docs Directory](packages/core/docs/). You can generate the latest docs by running:

```bash
npm run docs
```

You can also run the demo server at `http://localhost:3000` with:

```bash
npm run demo
```

## Command Line Interface (CLI)

The package includes a CLI tool (`packages/cli`) for interacting with the same endpoints exposed in the core library.

More details can be found in the [CLI Documentation](CLI.md), including a full E2E walkthrough of a staking flow.

## 🧪 Testing

```bash
npm test
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run linting
npm run lint

# Generate documentation
npm run docs

# Run demo server
npm run demo

# Run demo server in watch mode
npm run demo:dev
```

## Versioning & Publishing

This repo uses [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs across packages. `@sundial-protocol/btc-locker` and `@sundial-protocol/btc-locker-cli` are **linked** — they always share the same version number. The demo package is excluded from publishing.

### Workflow

```bash
# 1. After making changes, create a changeset to describe them
npx changeset

# 2. When ready to release, bump versions and update changelogs
npm run version

# 3. Build and publish to the registry
npm run release
```

`npm run version` runs `changeset version`, which consumes all pending changeset files and updates `package.json` versions and `CHANGELOG.md` files. `npm run release` builds all packages and then runs `changeset publish`.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- [GitHub Repository](https://github.com/sundial-protocol/btc-locker)

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/sundial-protocol/btc-locker/issues) on GitHub.
