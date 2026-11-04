---
"@sundial-protocol/btc-locker": minor
"@sundial-protocol/btc-provider": minor
"@sundial-protocol/btc-regtest": minor
---

Locktimes are checked the way nodes check them. `createClaimTransaction` (after the deadline), `createWithdrawalTransaction` and `createSpendingTransaction` now compare a block-height locktime with the chain tip's height and a time locktime with the tip's median time past, which runs about an hour behind the clock. Before, all three compared any locktime with the clock, so a height locktime always passed and a time locktime passed about an hour before nodes would accept the spend.

The builders ask the locker's API for the tip with the new `BitcoinAPI.getChainTip()` (height, hash and median time past, from one provider). A new `chainTip` parameter supplies the tip instead, for building ahead of time. `createClaimTransaction`'s `currentTime` still works, standing in for the median time past, and is deprecated. `LocktimeUtils` holds the rule. `esploraOverRpc` in btc-regtest serves `getChainTip`.
