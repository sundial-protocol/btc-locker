# @sundial-protocol/btc-regtest

A local Bitcoin Core regtest chain and the test helpers that talk to it. Used by
the regtest suites of `@sundial-protocol/btc-locker` (core),
`@sundial-protocol/solstice` and the CLI.

It imports no Sundial package. Its only dependencies are `bitcoinjs-lib`,
`ecpair` and `@bitcoinerlab/secp256k1`. It is TypeScript, compiled to `dist/`
(ES modules with type declarations) by `npm run build`. Inside this repository
turbo builds it before any package that depends on it, so `npm run build` at the
root, or the build step of a regtest CI job, is enough.

## What is in it

| File | What it is |
| --- | --- |
| `regtest.sh` | Installed as the `btc-regtest` command. Downloads Bitcoin Core 29.0 (release archive, SHA-256 pinned), starts `bitcoind -regtest`, runs a suite, stops it. With `--ord` it also downloads ord 0.29.0 and starts `ord --index-runes server`. |
| `src/index.ts` | `rpc`, `mine`, `party` (keys derived from a label), `utxosOf`, `heightOf`, `medianTime`, `mempoolAccept`, `broadcast`, `signAndBroadcast`, and `esploraOverRpc`, an Esplora-style chain API served from bitcoind. |
| `src/ord.ts` | Imported as `@sundial-protocol/btc-regtest/ord`: `ord`, `ordSynced`, `runeBalances`, and a `mine` that waits for ord. |

ord is opt-in. Without `--ord` (or `BTC_REGTEST_ORD=1`) the script never
downloads or starts it, and nothing in `src/index.ts` refers to it.

bitcoind runs with `-acceptnonstdtxn=0`, so its mempool applies the policy
mainnet nodes apply (dust limits, OP_RETURN size, standard script rules).
Regtest's default is to relax them.

## Using it from a package

In the package's `package.json`:

```json
{
  "scripts": {
    "test:regtest": "vitest run --config vitest.regtest.config.ts",
    "regtest": "btc-regtest run"
  },
  "devDependencies": {
    "@sundial-protocol/btc-regtest": "*"
  }
}
```

`npm run regtest` starts the daemons, runs `npm run test:regtest` in the
package's folder, and stops them. Use `btc-regtest run --ord` for a suite that
needs ord. To keep the chain up and look around:

```
npx btc-regtest up        # every `up` starts an empty chain
npm run test:regtest
npx btc-regtest status
npx btc-regtest down
```

The package keeps its own tests (`regtest/*.regtest.ts`) and its own
`vitest.regtest.config.ts`. Tests import the helpers by name:

```ts
import { mine, party, rpc } from "@sundial-protocol/btc-regtest";
import { runeBalances } from "@sundial-protocol/btc-regtest/ord";
```

### Platforms

Linux x86_64 and macOS. On Windows run the script inside WSL, from the package's
folder; the suite reaches the daemons on localhost with either a Linux node or
the Windows one:

```
wsl -e bash -lc 'cd /mnt/c/path/to/repo/packages/core && ../../node_modules/.bin/btc-regtest run'
```

If the ord release binary does not run (it needs OpenSSL 3, so Ubuntu 22.04 or
later), the script builds the same tag with `cargo install` (Rust 1.89 or later,
`libssl-dev`). On Sam's laptop (WSL 2, Ubuntu 20.04) that needed
`RUSTUP_TOOLCHAIN=1.91.1`.

### Settings

| Variable | Default | |
| --- | --- | --- |
| `BTC_REGTEST_HOME` | `~/.cache/btc-regtest` | Binaries, chain data, logs |
| `BTC_REGTEST_RPC_PORT` | `18543` | bitcoind RPC. User and password are both `regtest`. |
| `BTC_REGTEST_ORD_PORT` | `18580` | ord HTTP |
| `BTC_REGTEST_ORD` | unset | `1` is the same as `--ord` |

## Using it from another repository

The package stays in the btc-locker repository, next to the library both
products depend on, and is published to GitHub Packages like
`@sundial-protocol/btc-locker`. The Dawn and Solstice repositories install it;
they do not copy it. Checked on 2026-10-09 by packing it, installing the tarball
into an empty project outside this repository, and running a suite there.

In the other repository:

1. Have the `@sundial-protocol` scope point at GitHub Packages, the same setup
   that installs `@sundial-protocol/btc-locker`: an `.npmrc` with
   `@sundial-protocol:registry=https://npm.pkg.github.com` and a token that can
   read packages.
2. `npm install --save-dev @sundial-protocol/btc-regtest`.
3. Add the two scripts shown above, a `vitest.regtest.config.ts`, and tests under
   `regtest/`. When moving an existing suite, move those files as they are.
4. Copy the package's regtest job from `.github/workflows/ci.yml`. It names the
   package, not a path. Add `NODE_AUTH_TOKEN` to the install step if the
   repository does not already set it for btc-locker.

Before the first release from here exists, a repository can copy this folder
into its own `packages/` workspace instead. Imports and scripts are the same.

A repository that does not use Runes never downloads ord: it is only fetched
when a suite asks for it.

### What still needs touching at split time

- **The dev dependency range.** `"@sundial-protocol/btc-regtest": "*"` resolves
  to the workspace copy here. In another repository use a real version range.
- **`@sundial-protocol/btc-locker` in the Solstice and CLI packages.** It is
  `"*"` today and resolves to the workspace. Outside this repository it has to
  be a published version that includes the two fixes on this branch (the `api`
  argument reaching the builders, and the branch-selector check). The CLI's
  regtest test calls `createBTCLocker("regtest", api)`, which throws on 2.0.5.
- **Build before test.** The Solstice and CLI jobs build btc-locker through
  turbo because the workspace links to its source folder. Once btc-locker comes
  from npm that step only builds the package itself.
- **The CLI's Solstice test.** `packages/cli/regtest/solstice-etch.regtest.ts`
  tests the `solstice etch` command, so it lives with the CLI. `repo-structure.md`
  sends the CLI to the Dawn repository and does not say where the Solstice
  command goes. The test should follow the command.
- **Pinned versions.** Bitcoin Core and ord versions and checksums are in
  `regtest.sh`. A new Bitcoin Core or ord version is a new release of this
  package, and each repository picks it up by bumping the dependency.
- **Regtest in `BitcoinAPI`.** Suites pass `esploraOverRpc` where a `BitcoinAPI`
  is expected, with a cast. When the `baseUrl` option from the
  bitcoin-api-extraction spec exists, a real `BitcoinAPI` pointed at an Esplora
  instance could replace the cast. That is not needed for the split.
