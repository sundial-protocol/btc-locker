---
"@sundial-protocol/solstice": minor
"@sundial-protocol/btc-locker-cli": patch
---

Solstice now takes a chain API the way btc-locker does. The new `Solstice` class is constructed with a network and an optional `BitcoinAPI` from `@sundial-protocol/btc-provider`, and does the chain work around the builders: funding the etch commit from an address, checking the commit output and its confirmations before the etching, fee rates, and broadcast. The builder functions are unchanged and still exported. Fee rates come from the instance's own API (`BitcoinAPI.queryChainFeeRates`).

The CLI's `solstice` commands call the class. `solstice etch` now funds the commit with as few of the key's UTXOs as cover it, largest first; before, it spent every confirmed UTXO at the address.
