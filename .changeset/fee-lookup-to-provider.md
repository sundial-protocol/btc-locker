---
"@sundial-protocol/btc-provider": minor
"@sundial-protocol/btc-locker": major
"@sundial-protocol/btc-locker-cli": patch
---

The chain fee lookup moved from btc-locker to btc-provider. `BitcoinAPI` has a new method, `queryChainFeeRates(priority)`, which returns a fee rate in sat/vB from that API's own network and providers, with the same fallback between providers as every other call. `FeePriorities` is defined in btc-provider and btc-locker still exports it. `DEFAULT_CHAIN_FEE_RATES` stays in btc-locker, which owns those numbers.

**Breaking:** `FeeUtils.queryChainFeeRates(priority, network, provider)` is removed from btc-locker. Replace it with `api.queryChainFeeRates(priority)` on a `BitcoinAPI` for the network.

The locker's deposit, claim, distribute and withdraw builders now ask the locker's own API for the fee rate. Distribute and withdraw used to ask for mainnet rates on every network; they now use the locker's network.
