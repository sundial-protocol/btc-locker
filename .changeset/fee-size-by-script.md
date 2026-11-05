---
"@sundial-protocol/btc-locker": minor
---

Fees are sized from the transaction's real inputs and outputs. The deposit, distribution, claim and withdrawal builders, and `calculateDepositAmounts`, now size each input by the script it spends and each output by its script, with the new `FeeUtils.estimateTransactionFee` (also `estimateVsize`, `inputWeight` and `outputWeight`). Before, every input counted as 150 bytes and every output as 34, so transactions overpaid by up to about 90% on segwit inputs and undercounted the 71-byte metadata output. Fees from these builders are lower as a result.

A P2WSH input is sized from its witness script on the costliest path: a signature per signature check, the required count plus an empty item for `OP_CHECKMULTISIG`, and a selector per `OP_IF`. A P2SH input is sized from `redeemScript` when given (nested P2WPKH, nested P2WSH, or a legacy script spend) and otherwise taken as P2SH-P2WPKH. A P2PKH input is sized for an uncompressed key unless `publicKey` is given. P2WPKH and P2TR key-path inputs have fixed sizes.

`FeeUtils.estimateFee(inputCount, outputCount, feeRate)` is unchanged and deprecated.
