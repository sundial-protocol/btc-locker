# @sundial-protocol/btc-provider

## 1.1.0

### Minor Changes

- 24704c7: The chain fee lookup moved from btc-locker to btc-provider. `BitcoinAPI` has a new method, `queryChainFeeRates(priority)`, which returns a fee rate in sat/vB from that API's own network and providers, with the same fallback between providers as every other call. `FeePriorities` is defined in btc-provider and btc-locker still exports it. `DEFAULT_CHAIN_FEE_RATES` stays in btc-locker, which owns those numbers.

  **Breaking:** `FeeUtils.queryChainFeeRates(priority, network, provider)` is removed from btc-locker. Replace it with `api.queryChainFeeRates(priority)` on a `BitcoinAPI` for the network.

  The locker's deposit, claim, distribute and withdraw builders now ask the locker's own API for the fee rate. Distribute and withdraw used to ask for mainnet rates on every network; they now use the locker's network.

- 4ff749d: `getFinalityProof` now builds the proof Charms accepts, not a fixed six headers.

  - **Headers by work.** The second argument is now required: a count, `{ headerCount }`, or `{ targetBits, maxHeaders? }`. With `targetBits`, headers are added until the transaction's block and the blocks after it hold the work of that target. The caller supplies the target, because the rule belongs to the verifier and not to this package; for Charms it is `FINALITY_TARGET_BITS` in charms-client's `bitcoin_tx.rs`, which was six headers on mainnet on 2026-10-13, at 104% of the requirement (a fall in difficulty of about 4% makes it seven). Calling with neither a count nor a target, or with both, throws. A count still returns exactly that many headers. When the difficulty puts the work out of reach, as on a test network, the call fails after `maxHeaders` headers (36 by default). It does not give up earlier on an estimate, because a later block can hold far more work than the transaction's own.
  - **Merkle inclusion.** The merkle block is now verified: its partial merkle tree has to lead from the transaction to the merkle root in the block header, and the proof has to match that transaction and no other. That is the smallest proof, and it also passes a verifier that reads only the first match, as Charms does. `merkleBlockNames` itself accepts the transaction anywhere among the matches, the general test. Before, the check was that the transaction's id appeared among the proof's bytes.
  - Every header, and the transaction's block, has to meet the proof-of-work target it states.

  New exports: `merkleBlockTransactions`, `merkleBlockNames`, `targetOfBits`, `workOfBits`, `workOfHeader`, `headerMeetsItsTarget` and the `FinalityProofOptions` type.

- 6086622: btc-provider no longer carries the locker's choices as its own defaults.

  - **User-Agent.** Requests outside a browser send `User-Agent: btc-provider/<version> (+https://github.com/sundial-protocol/btc-locker)`, not `btc-locker-cli/1.0.0`, so a provider can see what is calling and where to report a problem. The new `userAgent` option sets another, which products should use to label their own traffic, and `null` sends none. The version comes from `src/version.ts`, which the root `npm run version` now rewrites after `changeset version`.
  - **Fee fallback.** `queryChainFeeRates` used to return fixed rates (20, 10 and 5 sat/vB) when no provider answered, or when a provider returned no estimates, without saying so. Now it throws, unless the new `fallbackFeeRates` option (a rate per `FeePriorities`) was given, in which case those are returned.

  btc-locker's `BitcoinAPI` is now a subclass of the provider's that passes the locker's rates as `fallbackFeeRates`, so the locker's builders and the CLI behave as before. A `BitcoinAPI` from btc-provider used directly, such as Solstice's default, now throws when no provider gives a fee rate.

- d614483: `BitcoinAPI` can now report confirmations and build a Bitcoin finality proof, which is what Sunbeam needs to beam from Bitcoin. New methods, all with the usual fallback between providers:

  - `getTransactionStatus(txid)` and `getConfirmations(txid)`
  - `getMerkleBlockProof(txid)`, `getBlockHash(height)` and `getBlockHeader(blockHash)`
  - `getFinalityProof(txid, headerCount = 6)`, which returns `{ tx, proof, headers }`: the raw transaction, its merkle block, and the headers of the blocks after its block. It needs `headerCount + 1` confirmations. Before returning, it checks that the merkle block is for the transaction's block, that every header hashes to the block asked for, and that each builds on the one before.

  `scripts/finality-proof.mjs` fetches a proof from each live provider and checks they agree. It is run by hand, not in CI.

  btc-regtest's `esploraOverRpc` serves the same reads from bitcoind (`getTransactionStatus`, `getConfirmations`, `getMerkleBlockProof`, `getBlockHash`, `getBlockHeader`). Solstice's `getConfirmations` now calls the API's method, so it falls back between providers.
