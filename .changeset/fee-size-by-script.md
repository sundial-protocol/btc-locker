---
"@sundial-protocol/btc-locker": minor
---

Fees are sized from the transaction's real inputs and outputs. The deposit, distribution, claim and withdrawal builders, and `calculateDepositAmounts`, now size each input by the script it spends (P2WPKH, P2TR, P2WSH from its witness script, P2SH-P2WPKH, P2PKH) and each output by its script, with the new `FeeUtils.estimateTransactionFee` (also `estimateVsize`, `inputWeight` and `outputWeight`). Before, every input counted as 150 bytes and every output as 34, so transactions overpaid by up to about 90% on segwit inputs and undercounted the 71-byte metadata output. Fees from these builders are lower as a result.

`FeeUtils.estimateFee(inputCount, outputCount, feeRate)` is unchanged and deprecated.
