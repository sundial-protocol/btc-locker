# @sundial-protocol/solstice

## 0.2.1

### Patch Changes

- 8428539: Each package now ships the MIT license text in a `LICENSE` file, and its `package.json` has a `license` field and a `repository.directory` pointing at its folder in this repo. Earlier releases said MIT in most `package.json` files, but the repository had no license file.
- Updated dependencies [8428539]
- Updated dependencies [02b8693]
  - @sundial-protocol/btc-provider@1.2.0
  - @sundial-protocol/btc-locker@3.0.2
  - @sundial-protocol/btc-runes@0.1.1

## 0.2.0

### Minor Changes

- fceb5af: The Runes functions re-exported from `@sundial-protocol/btc-runes` (`encipherGuarded`, `nativeRunestoneCodec.encipher`, `runeCommitment`) now return a plain `Uint8Array`, not a Node `Buffer`, and accept any `Uint8Array`. Code that calls `Buffer` methods on a result has to wrap it first: `Buffer.from(script).toString("hex")`. Calling `.toString("hex")` on the bare result does not throw; it returns comma-separated numbers.
- 24704c7: Solstice now takes a chain API the way btc-locker does. The new `Solstice` class is constructed with a network and an optional `BitcoinAPI` from `@sundial-protocol/btc-provider`, and does the chain work around the builders: funding the etch commit from an address, checking the commit output and its confirmations before the etching, fee rates, and broadcast. The builder functions are unchanged and still exported. Fee rates come from the instance's own API (`BitcoinAPI.queryChainFeeRates`).

  The CLI's `solstice` commands call the class. `solstice etch` now funds the commit with as few of the key's UTXOs as cover it, largest first; before, it spent every confirmed UTXO at the address.

### Patch Changes

- d614483: `BitcoinAPI` can now report confirmations and build a Bitcoin finality proof, which is what Sunbeam needs to beam from Bitcoin. New methods, all with the usual fallback between providers:

  - `getTransactionStatus(txid)` and `getConfirmations(txid)`
  - `getMerkleBlockProof(txid)`, `getBlockHash(height)` and `getBlockHeader(blockHash)`
  - `getFinalityProof(txid, headerCount = 6)`, which returns `{ tx, proof, headers }`: the raw transaction, its merkle block, and the headers of the blocks after its block. It needs `headerCount + 1` confirmations. Before returning, it checks that the merkle block is for the transaction's block, that every header hashes to the block asked for, and that each builds on the one before.

  `scripts/finality-proof.mjs` fetches a proof from each live provider and checks they agree. It is run by hand, not in CI.

  btc-regtest's `esploraOverRpc` serves the same reads from bitcoind (`getTransactionStatus`, `getConfirmations`, `getMerkleBlockProof`, `getBlockHash`, `getBlockHeader`). Solstice's `getConfirmations` now calls the API's method, so it falls back between providers.

- fc44025: The Runes primitives (runestone codec, cenotaph guard, rune names, rune ids, varints) moved to the new `@sundial-protocol/btc-runes` package. Solstice depends on it and still re-exports the same names, so existing imports keep working.
- Updated dependencies [24704c7]
- Updated dependencies [4ff749d]
- Updated dependencies [6086622]
- Updated dependencies [d614483]
  - @sundial-protocol/btc-provider@1.1.0
  - @sundial-protocol/btc-locker@3.0.0

## 0.1.0

### Minor Changes

- receipt token library introduced

### Patch Changes

- Updated dependencies
  - @sundial-protocol/btc-locker@2.1.0
