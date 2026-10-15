# @sundial-protocol/btc-locker

## 3.0.0

### Major Changes

- 24704c7: The chain fee lookup moved from btc-locker to btc-provider. `BitcoinAPI` has a new method, `queryChainFeeRates(priority)`, which returns a fee rate in sat/vB from that API's own network and providers, with the same fallback between providers as every other call. `FeePriorities` is defined in btc-provider and btc-locker still exports it. `DEFAULT_CHAIN_FEE_RATES` stays in btc-locker, which owns those numbers.

  **Breaking:** `FeeUtils.queryChainFeeRates(priority, network, provider)` is removed from btc-locker. Replace it with `api.queryChainFeeRates(priority)` on a `BitcoinAPI` for the network.

  The locker's deposit, claim, distribute and withdraw builders now ask the locker's own API for the fee rate. Distribute and withdraw used to ask for mainnet rates on every network; they now use the locker's network.

### Patch Changes

- 6086622: btc-provider no longer carries the locker's choices as its own defaults.

  - **User-Agent.** Requests outside a browser send `User-Agent: btc-provider/<version> (+https://github.com/sundial-protocol/btc-locker)`, not `btc-locker-cli/1.0.0`, so a provider can see what is calling and where to report a problem. The new `userAgent` option sets another, which products should use to label their own traffic, and `null` sends none. The version comes from `src/version.ts`, which the root `npm run version` now rewrites after `changeset version`.
  - **Fee fallback.** `queryChainFeeRates` used to return fixed rates (20, 10 and 5 sat/vB) when no provider answered, or when a provider returned no estimates, without saying so. Now it throws, unless the new `fallbackFeeRates` option (a rate per `FeePriorities`) was given, in which case those are returned.

  btc-locker's `BitcoinAPI` is now a subclass of the provider's that passes the locker's rates as `fallbackFeeRates`, so the locker's builders and the CLI behave as before. A `BitcoinAPI` from btc-provider used directly, such as Solstice's default, now throws when no provider gives a fee rate.

- Updated dependencies [24704c7]
- Updated dependencies [4ff749d]
- Updated dependencies [6086622]
- Updated dependencies [d614483]
  - @sundial-protocol/btc-provider@1.1.0

## 2.2.0

### Minor Changes

- provider moved to new package, improved fallback support, node 18, blockcypher removed

## 2.1.1

### Patch Changes

- 1b307ab: Fix two bugs found by the new regtest suite.

  - `signTransaction` gave a plain timelock script an escrow-style witness when the script's bytes (a public key or a locktime) contained `0x63` or `0x64`, and the network rejected the transaction. It now looks at opcodes only.
  - `new BTCLocker(network, api)` and `createBTCLocker(network, api)` now hand `api` to the transaction builders. Before, builders always used a default mempool.space API.

## 2.1.0

### Patch Changes

- receipt token library introduced

## 2.0.5

### Patch Changes

- select api for fee query

## 2.0.4

### Patch Changes

- set api in Locker

## 2.0.3

### Patch Changes

- audit fixes & fees

## 2.0.2

### Patch Changes

- P2WSH script addresses

## 2.0.1

### Patch Changes

- output p2wpkh scripts instead of p2sh scripts

## 2.0.0

### Major Changes

- convert to turborepo w/ changesets
