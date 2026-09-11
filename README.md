![](readme-header.jpg)

<table>
  <tr>
    <td>
      <!-- badge:build:start -->
<img alt="Build" src="https://img.shields.io/badge/build-passing-brightgreen?style=flat-square" />
<!-- badge:build:end -->
    </td>
    <td>
      <!-- badge:type-check:start -->
<img alt="Type Check" src="https://img.shields.io/badge/type%20check-passing-brightgreen?style=flat-square" />
<!-- badge:type-check:end -->
    </td>
    <td>
      <!-- badge:lint:start -->
<img alt="Lint" src="https://img.shields.io/badge/lint-passing-brightgreen?style=flat-square" />
<!-- badge:lint:end -->
    </td>
  </tr>
  <tr>
    <td>
      <!-- badge:tests:start -->
<img alt="Tests" src="https://img.shields.io/badge/tests-passing-brightgreen?style=flat-square" />
<!-- badge:tests:end -->
    </td>
    <td>
      <!-- badge:coverage:start -->
<img alt="Coverage" src="https://img.shields.io/badge/coverage-88.9%25-yellowgreen?style=flat-square" />
<!-- badge:coverage:end -->
    </td>
    <td>&nbsp;</td>
  </tr>
</table>

## BTC Locker

A comprehensive Bitcoin staking library for Sundial Protocol, enabling the creation of various timelock scripts to securely lock Bitcoin funds for yield generation, as well as yield calculation and distribution utilities for our yield providers.

This is a **Turborepo monorepo** containing the following packages under `packages/`:

1. **`packages/core` (`@sundial-protocol/btc-locker`)**: The core TypeScript library for integration into web applications, Node.js backends, or any JavaScript/TypeScript environment.

2. **`packages/solstice` (`@sundial-protocol/solstice`)**: The Runes receipt-token and atomic-swap layer for the Solstice value-accrual vault, built on top of the core library's script, PSBT and signing primitives.

3. **`packages/cli` (`@sundial-protocol/btc-locker-cli`)**: A user-friendly CLI tool for interacting with the core and solstice libraries directly from the terminal.

4. **`packages/demo` (`@sundial-protocol/btc-locker-demo`)**: A multipurpose demo server used for running interactive documentation locally and demonstrating how to use the library.

1. **Vitest unit tests (`packages/core/tests/`, `packages/solstice/tests/`)**: Unit tests used to verify the correctness & stability of the core and solstice libraries.

2. **TypeDocs (`docs/`)**: A .gitignored folder with the generated API reference for the core, solstice and CLI packages. Run `npm run docs` to generate the latest documentation for your local demo.

3. **Test Coverage (`coverage/`)**: Another .gitignored folder. If you're looking for a full report on test coverage here is where to go. Run `npm run test:coverage`.

## Features

- **Construct Scripts**: Create various timelock scripts (absolute, relative, escrow) for locking Bitcoin funds.
- **Build Transactions**: Construct transactions to fund timelock scripts, spend from them, and distribute yield.
- **Solstice Receipt Tokens**: Etch a per-instance Runes receipt token and build atomic BTC⇄RT invest/withdraw swaps (`@sundial-protocol/solstice`).
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

## Solstice

`@sundial-protocol/solstice` (`packages/solstice`) adds the token and swap layer the Solstice vault needs on top of the core library, which it reuses for scripts, PSBT construction, fees, UTXO selection and signing:

| Spec component | Export |
| --- | --- |
| **C0** Token Inscription | `buildEtchTransaction` |
| **C1** Investment | `buildInvestTransaction` |
| **C2** Standard Withdrawal | `buildWithdrawTransaction` |
| Generic swap (behind C1 and C2) | `buildSwapTransaction` |
| Cenotaph guard | `encipherGuarded` |

```ts
import { buildEtchTransaction, type ReceiptRune } from "@sundial-protocol/solstice";

const rune: ReceiptRune = {
  name: "EXAMPLERUNE",
  displayTicker: "RT",
  divisibility: 8,
  symbol: 0x24,
  totalSupply: 2_100_000_000_000_000n,
};

// C0 — premine the full supply into the Vault; returns an unsigned psbtBase64
const etch = buildEtchTransaction({ rune, vaultAddress, inputs, changeAddress, feeRate, network });
```

See [packages/solstice/README.md](packages/solstice/README.md) for the design decisions, full invest/withdraw examples and current scope. The same flows are available from the CLI under `btc-locker solstice` (see [CLI Documentation](CLI.md)).

## API Documentation

Detailed API documentation for the core, solstice and CLI packages is available in the [Docs Directory](docs/). You can generate the latest docs by running:

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

This repo uses [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs across packages. `@sundial-protocol/btc-locker` and `@sundial-protocol/btc-locker-cli` are **linked** — they always share the same version number. `@sundial-protocol/solstice` is versioned independently. The demo package is excluded from publishing.

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
