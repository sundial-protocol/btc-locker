---
"@sundial-protocol/btc-locker": patch
---

Fix two bugs found by the new regtest suite.

- `signTransaction` gave a plain timelock script an escrow-style witness when the script's bytes (a public key or a locktime) contained `0x63` or `0x64`, and the network rejected the transaction. It now looks at opcodes only.
- `new BTCLocker(network, api)` and `createBTCLocker(network, api)` now hand `api` to the transaction builders. Before, builders always used a default mempool.space API.
