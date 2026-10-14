---
"@sundial-protocol/btc-provider": minor
---

`getFinalityProof` now builds the proof Charms accepts, not a fixed six headers.

- **Headers by work.** The second argument is now required: a count, `{ headerCount }`, or `{ targetBits, maxHeaders? }`. With `targetBits`, headers are added until the transaction's block and the blocks after it hold the work of that target. The caller supplies the target, because the rule belongs to the verifier and not to this package; for Charms it is `FINALITY_TARGET_BITS` in charms-client's `bitcoin_tx.rs`, which was six headers on mainnet on 2026-10-13, at 104% of the requirement (a fall in difficulty of about 4% makes it seven). Calling with neither a count nor a target, or with both, throws. A count still returns exactly that many headers. When the difficulty puts the work out of reach, as on a test network, the call fails after `maxHeaders` headers (36 by default). It does not give up earlier on an estimate, because a later block can hold far more work than the transaction's own.
- **Merkle inclusion.** The merkle block is now verified: its partial merkle tree has to lead from the transaction to the merkle root in the block header, and the proof has to match that transaction and no other. That is the smallest proof, and it also passes a verifier that reads only the first match, as Charms does. `merkleBlockNames` itself accepts the transaction anywhere among the matches, the general test. Before, the check was that the transaction's id appeared among the proof's bytes.
- Every header, and the transaction's block, has to meet the proof-of-work target it states.

New exports: `merkleBlockTransactions`, `merkleBlockNames`, `targetOfBits`, `workOfBits`, `workOfHeader`, `headerMeetsItsTarget` and the `FinalityProofOptions` type.
