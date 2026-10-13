---
"@sundial-protocol/btc-provider": minor
"@sundial-protocol/btc-regtest": minor
"@sundial-protocol/solstice": patch
---

`BitcoinAPI` can now report confirmations and build a Bitcoin finality proof, which is what Sunbeam needs to beam from Bitcoin. New methods, all with the usual fallback between providers:

- `getTransactionStatus(txid)` and `getConfirmations(txid)`
- `getMerkleBlockProof(txid)`, `getBlockHash(height)` and `getBlockHeader(blockHash)`
- `getFinalityProof(txid, headerCount = 6)`, which returns `{ tx, proof, headers }`: the raw transaction, its merkle block, and the headers of the blocks after its block. It needs `headerCount + 1` confirmations. Before returning, it checks that the merkle block is for the transaction's block, that every header hashes to the block asked for, and that each builds on the one before.

`scripts/finality-proof.mjs` fetches a proof from each live provider and checks they agree. It is run by hand, not in CI.

btc-regtest's `esploraOverRpc` serves the same reads from bitcoind (`getTransactionStatus`, `getConfirmations`, `getMerkleBlockProof`, `getBlockHash`, `getBlockHeader`). Solstice's `getConfirmations` now calls the API's method, so it falls back between providers.
