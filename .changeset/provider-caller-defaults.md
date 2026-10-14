---
"@sundial-protocol/btc-provider": minor
"@sundial-protocol/btc-locker": patch
---

btc-provider no longer carries the locker's choices as its own defaults.

- **User-Agent.** Requests outside a browser send `User-Agent: btc-provider`, not `btc-locker-cli/1.0.0`. The new `userAgent` option sets another, and `null` sends none.
- **Fee fallback.** `queryChainFeeRates` used to return fixed rates (20, 10 and 5 sat/vB) when no provider answered, or when a provider returned no estimates, without saying so. Now it throws, unless the new `fallbackFeeRates` option (a rate per `FeePriorities`) was given, in which case those are returned.

btc-locker's `BitcoinAPI` is now a subclass of the provider's that passes the locker's rates as `fallbackFeeRates`, so the locker's builders and the CLI behave as before. A `BitcoinAPI` from btc-provider used directly, such as Solstice's default, now throws when no provider gives a fee rate.
