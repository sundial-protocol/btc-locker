# @sundial-protocol/btc-locker-cli

## 3.0.0

### Patch Changes

- 24704c7: The chain fee lookup moved from btc-locker to btc-provider. `BitcoinAPI` has a new method, `queryChainFeeRates(priority)`, which returns a fee rate in sat/vB from that API's own network and providers, with the same fallback between providers as every other call. `FeePriorities` is defined in btc-provider and btc-locker still exports it. `DEFAULT_CHAIN_FEE_RATES` stays in btc-locker, which owns those numbers.

  **Breaking:** `FeeUtils.queryChainFeeRates(priority, network, provider)` is removed from btc-locker. Replace it with `api.queryChainFeeRates(priority)` on a `BitcoinAPI` for the network.

  The locker's deposit, claim, distribute and withdraw builders now ask the locker's own API for the fee rate. Distribute and withdraw used to ask for mainnet rates on every network; they now use the locker's network.

- 24704c7: Solstice now takes a chain API the way btc-locker does. The new `Solstice` class is constructed with a network and an optional `BitcoinAPI` from `@sundial-protocol/btc-provider`, and does the chain work around the builders: funding the etch commit from an address, checking the commit output and its confirmations before the etching, fee rates, and broadcast. The builder functions are unchanged and still exported. Fee rates come from the instance's own API (`BitcoinAPI.queryChainFeeRates`).

  The CLI's `solstice` commands call the class. `solstice etch` now funds the commit with as few of the key's UTXOs as cover it, largest first; before, it spent every confirmed UTXO at the address.

- Updated dependencies [24704c7]
- Updated dependencies [6086622]
- Updated dependencies [d614483]
- Updated dependencies [fc44025]
- Updated dependencies [fceb5af]
- Updated dependencies [24704c7]
  - @sundial-protocol/btc-locker@3.0.0
  - @sundial-protocol/solstice@0.2.0

## 2.2.0

### Minor Changes

- provider moved to new package, improved fallback support, node 18, blockcypher removed

### Patch Changes

- Updated dependencies
  - @sundial-protocol/btc-locker@2.2.0

## 2.1.0

### Minor Changes

- receipt token library introduced

### Patch Changes

- Updated dependencies
  - @sundial-protocol/solstice@0.1.0
  - @sundial-protocol/btc-locker@2.1.0

## 2.0.4

### Patch Changes

- set api in Locker
- Updated dependencies
  - @sundial-protocol/btc-locker@2.0.4

## 2.0.3

### Patch Changes

- audit fixes & fees
- Updated dependencies
  - @sundial-protocol/btc-locker@2.0.3

## 2.0.0

### Major Changes

- convert to turborepo w/ changesets

### Patch Changes

- Updated dependencies
  - @sundial-protocol/btc-locker@2.0.0
