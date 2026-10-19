---
"@sundial-protocol/btc-provider": minor
---

btc-provider now depends on `bitcoinjs-lib` instead of keeping its own copies of what that library already does.

- **Transaction ids.** `transactionId` parses with `bitcoinjs-lib`'s `Transaction` and returns its `getId()`. It drops the package's own SHA-256. Hex that is not a whole transaction now throws `Transaction could not be parsed: ...`, where it used to throw `Transaction is truncated`. A transaction followed by extra bytes is now rejected.
- **Block headers.** `blockHashOfHeader`, `previousBlockHashOfHeader` and the `bits` used for proof of work come from `bitcoinjs-lib`'s `Block`. The merkle-block walk uses its `crypto.hash256`. The target and work arithmetic (`targetOfBits`, `workOfBits`) stays here, because it works on `bigint` and has to handle every compact value.
- **Networks.** `NETWORKS` holds `bitcoinjs-lib`'s own network objects (testnet4 uses testnet's), and `Network` is `bitcoinjs-lib`'s type, not a copy with the same values.

- **CompactSize.** The merkle-block walk reads its counts with `varuint-bitcoin`, the bitcoinjs project's package for them, now a direct dependency.

The BIP 37 merkle-block walk and the hex decoding are still this package's own code. The hex decoder bitcoinjs-lib uses does not reject bad input.
