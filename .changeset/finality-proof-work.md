---
"@sundial-protocol/btc-provider": minor
---

`getFinalityProof` now builds the proof Charms accepts, not a fixed six headers.

- **Headers by work.** With no count given, headers are added until the transaction's block and the blocks after it hold the work Charms requires (`CHARMS_FINALITY_TARGET_BITS`, its `FINALITY_TARGET_BITS`). That was six headers on mainnet on 2026-10-13, at 104% of the requirement; a fall in difficulty of about 4% makes it seven. The second argument is now a count or `{ headerCount, targetBits, maxHeaders }`. A count still returns exactly that many headers. When the difficulty puts the work out of reach, as on a test network, the call fails after `maxHeaders` headers (36 by default). It does not give up earlier on an estimate, because a later block can hold far more work than the transaction's own.
- **Merkle inclusion.** The merkle block is now verified: its partial merkle tree has to lead from the transaction to the merkle root in the block header, and the transaction has to be the first one it matches, which is Charms' test. Before, the check was that the transaction's id appeared among the proof's bytes.
- Every header, and the transaction's block, has to meet the proof-of-work target it states.

New exports: `merkleBlockTransactions`, `merkleBlockNames`, `targetOfBits`, `workOfBits`, `workOfHeader`, `headerMeetsItsTarget`, `CHARMS_FINALITY_TARGET_BITS` and the `FinalityProofOptions` type.
