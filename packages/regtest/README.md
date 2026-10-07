# @sundial-protocol/btc-regtest

A local Bitcoin Core regtest chain and the test helpers that talk to it. Used by
the regtest suites of `@sundial-protocol/btc-locker` (core),
`@sundial-protocol/solstice` and the CLI.

It imports no Sundial package. Its only dependencies are `bitcoinjs-lib`,
`ecpair` and `@bitcoinerlab/secp256k1`. It is plain JavaScript with hand-written
type declarations, so there is nothing to build.

## What is in it

| File | What it is |
| --- | --- |
| `regtest.sh` | Installed as the `btc-regtest` command. Downloads Bitcoin Core 29.0 (release archive, SHA-256 pinned), starts `bitcoind -regtest`, runs a suite, stops it. With `--ord` it also downloads ord 0.29.0 and starts `ord --index-runes server`. |
| `index.js` | `rpc`, `mine`, `party` (keys derived from a label), `utxosOf`, `heightOf`, `medianTime`, `mempoolAccept`, `broadcast`, `signAndBroadcast`, and `esploraOverRpc`, an Esplora-style chain API served from bitcoind. |
| `ord.js` | Imported as `@sundial-protocol/btc-regtest/ord`: `ord`, `ordSynced`, `runeBalances`, and a `mine` that waits for ord. |

ord is opt-in. Without `--ord` (or `BTC_REGTEST_ORD=1`) the script never
downloads or starts it, and nothing in `index.js` refers to it.

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

## Taking it along when a package moves to its own repository

This folder is set up to be **depended on by name**. Tests, scripts and CI refer
to `@sundial-protocol/btc-regtest` and to the `btc-regtest` command, never to a
path, so they do not change when the package comes from somewhere else. Three
repositories will need it (btc-locker, Solstice, Dawn), which is why it is a
package and not a folder each of them edits.

Until it is published, copy the folder. Both routes end with the same imports.

**Route A, copy the folder (works today):**

1. Copy `packages/regtest/` into the new repository's `packages/` folder. Copy
   the whole folder, including `.gitattributes`.
2. Make sure the new repository's root `package.json` lists `packages/*` (or
   this folder) under `workspaces`, then run `npm install`. npm links the folder
   as `@sundial-protocol/btc-regtest` and puts `btc-regtest` on the path.
3. Run `git update-index --chmod=+x packages/regtest/regtest.sh` if the copy was
   made on Windows, where the executable bit is lost.
4. Copy the package's regtest job from `.github/workflows/ci.yml`. It names the
   package, not a path, so it needs no edits.

**Route B, publish it (no copy):**

1. In this folder's `package.json`, remove `"private": true` and add
   `"publishConfig": { "registry": "https://npm.pkg.github.com" }`, like the
   other packages. Publish it.
2. In each package that uses it, change the dev dependency from `"*"` to the
   published version.
3. Delete the folder from every repository that had a copy.

A future core repository never downloads ord on either route: ord is only
fetched when a suite asks for it.

### What still needs touching at split time

- **The dev dependency range.** `"@sundial-protocol/btc-regtest": "*"` resolves
  to the workspace copy. With route B it needs a real version.
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
  `regtest.sh`. With copies in several repositories they can drift apart; with
  route B they cannot.
- **Regtest in `BitcoinAPI`.** Suites pass `esploraOverRpc` where a `BitcoinAPI`
  is expected, with a cast. When the `baseUrl` option from the
  bitcoin-api-extraction spec exists, a real `BitcoinAPI` pointed at an Esplora
  instance could replace the cast. That is not needed for the split.
