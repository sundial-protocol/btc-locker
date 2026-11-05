# @sundial-protocol/btc-regtest

## 0.3.0

### Minor Changes

- c0343e0: Locktimes are checked the way nodes check them. `createClaimTransaction` (after the deadline), `createWithdrawalTransaction` and `createSpendingTransaction` now compare a block-height locktime with the chain tip's height and a time locktime with the tip's median time past, which runs about an hour behind the clock. Before, all three compared any locktime with the clock, so a height locktime always passed and a time locktime passed about an hour before nodes would accept the spend.

  The builders ask the locker's API for the tip with the new `BitcoinAPI.getChainTip()` (height, hash and median time past, from one provider). A new `chainTip` parameter supplies the tip instead, for building ahead of time. `createClaimTransaction`'s `currentTime` still works, standing in for the median time past, and is deprecated. `LocktimeUtils` holds the rule. `esploraOverRpc` in btc-regtest serves `getChainTip`.

## 0.2.1

### Patch Changes

- 8428539: Each package now ships the MIT license text in a `LICENSE` file, and its `package.json` has a `license` field and a `repository.directory` pointing at its folder in this repo. Earlier releases said MIT in most `package.json` files, but the repository had no license file.

## 0.2.0

### Minor Changes

- d614483: `BitcoinAPI` can now report confirmations and build a Bitcoin finality proof, which is what Sunbeam needs to beam from Bitcoin. New methods, all with the usual fallback between providers:

  - `getTransactionStatus(txid)` and `getConfirmations(txid)`
  - `getMerkleBlockProof(txid)`, `getBlockHash(height)` and `getBlockHeader(blockHash)`
  - `getFinalityProof(txid, headerCount = 6)`, which returns `{ tx, proof, headers }`: the raw transaction, its merkle block, and the headers of the blocks after its block. It needs `headerCount + 1` confirmations. Before returning, it checks that the merkle block is for the transaction's block, that every header hashes to the block asked for, and that each builds on the one before.

  `scripts/finality-proof.mjs` fetches a proof from each live provider and checks they agree. It is run by hand, not in CI.

  btc-regtest's `esploraOverRpc` serves the same reads from bitcoind (`getTransactionStatus`, `getConfirmations`, `getMerkleBlockProof`, `getBlockHash`, `getBlockHeader`). Solstice's `getConfirmations` now calls the API's method, so it falls back between providers.
