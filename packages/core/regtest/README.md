# Core regtest suite

`locker.regtest.ts` builds transactions with this package's builders, signs them
with `signTransaction`, and asks a local bitcoind whether it accepts them. The
unit tests in `tests/` check the shape of a PSBT; this suite is the only place
the scripts are run by the Bitcoin script interpreter.

```
npm run regtest                 # start bitcoind, run the suite, stop
```

or `npx btc-regtest up`, then `npm run test:regtest`, then `npx btc-regtest down`.
The daemon script and the helpers come from `@sundial-protocol/btc-regtest`; its
README covers platforms, Windows and settings. This suite uses bitcoind only.

CI runs it as the `regtest-core` job in `.github/workflows/ci.yml`.

## What it checks

| Flow | Builder | Checked on chain |
| --- | --- | --- |
| Deposit | `createDepositTransactionWithScript` | Accepted with escrow, timelock, protocol fee, change and metadata outputs. |
| Escrow, before branch | `createClaimTransaction` | The before key spends it. The after key's signature is rejected. A key outside the script cannot sign. The after branch is non-final before the deadline. |
| Escrow, after branch | `createClaimTransaction` | Non-final before the deadline. After it, the after key spends it and the before key's signature is rejected. |
| Distribute | `createDistributionTransaction` | Accepted, and the output is later spent with the timelock. |
| Timelock, block height | `createSpendingTransaction` | Non-final until the tip reaches the deadline. A transaction that states an earlier locktime fails `OP_CHECKLOCKTIMEVERIFY`. Another key cannot sign. |
| Timelock, time | `createSpendingTransaction` | Non-final until six of the last eleven blocks are past the deadline. |
| Relative timelock | `createSpendingTransaction` | `non-BIP68-final` until the output has the confirmations the script asks for. |
| Withdraw | `createWithdrawalTransaction` | Escrow and timelock inputs in one transaction, inputs looked up through the injected API. Non-final before the deadline, accepted after. |
| Fees | all of the above | Every accepted transaction pays at least the fee rate times its real vsize, and `FeeUtils.estimateFee` is at or above that. |

## How the locker runs on regtest

`BitcoinAPI` has no regtest endpoint and its constructor throws for regtest.
The suite does not change that. It builds the locker with an API object of its
own, `new BTCLocker(NETWORKS.regtest, api)`, where `api` is the harness's
`esploraOverRpc` (bitcoind's RPC behind `BitcoinAPI`'s method names) plus
`networkType`, `provider` and a `queryChainFeeRates` that answers a fixed
3 sat/vB, cast to `BitcoinAPI`. Regtest has no fee market, and every builder
asks the locker's API for its fee rate.

## Found by this suite, 2026-10-07

Fixed, each with a unit test:

1. **`signTransaction` produced an invalid transaction for some timelock
   scripts.** It decided whether a script has an `OP_IF` branch by searching the
   script's bytes for `0x63` or `0x64`. Those bytes also occur inside public keys
   (about one compressed key in four) and inside locktimes. A plain timelock
   script that matched got an escrow-style witness with a branch selector, and
   bitcoind rejected the spend. Both `createSpendingTransaction` spends and the
   timelock input of a withdrawal were affected. It now looks at opcodes only
   (`tests/core.test.ts`).
2. **`new BTCLocker(network, api)` did not hand `api` to the transaction, script
   and key components.** Builders used a default mempool.space API whatever the
   caller passed, and a locker could not be created for regtest at all. The
   components now share the locker's API (`tests/locker-index.test.ts`).

3. **Distribute and withdraw asked for mainnet fee rates on every network.**
   They called `FeeUtils.queryChainFeeRates(priority)` without the network, and
   the default was mainnet. None of the four builders used the injected API for
   fees: the function always created its own `BitcoinAPI`. Fixed 2026-10-13 by
   moving the lookup to `BitcoinAPI.queryChainFeeRates` in
   `@sundial-protocol/btc-provider`; all four builders now ask the locker's own
   API, so its network, providers and fallback apply.

4. **Claim and withdraw did not count the metadata output in the fee.** A claim
   to a P2WPKH address with metadata was 192 to 193 vB against an estimate of
   194, so it passed by one or two bytes; to a P2WSH or taproot address it would
   have paid slightly under the target rate. Fixed 2026-11-04: both builders now
   count it, as deposit and distribute already did (`tests/escrow.test.ts`,
   `tests/deposit-withdraw.test.ts`).

5. **Builders compared a locktime with the clock; consensus does not.** For a
   block-height locktime the guard always passed. For a time-based one, the
   builder allowed the spend as soon as the clock passed the deadline, and nodes
   rejected it as non-final until the median time past did, about an hour later
   on mainnet. Fixed 2026-11-04: the claim, withdrawal and spending builders ask
   the locker's API for the chain tip (`BitcoinAPI.getChainTip`) and apply the
   node's rule, a height locktime against the tip's height and a time locktime
   against its median time past. A `chainTip` parameter builds ahead of time,
   which this suite uses to show the node refusing early spends
   (`tests/locktime.test.ts`).

6. **`estimateFee` assumed 150 bytes per input and 34 per output.** Real
   inputs here are 68 to 111 vB, so transactions paid 3.0 to 5.7 sat/vB
   against a target of 3, and the 71-byte metadata output was undercounted.
   Fixed 2026-11-04: the deposit, distribution, claim and withdrawal builders
   size each input by the script it spends (P2WSH from its witness script, with
   the branch selector when it has one) and each output by its real script,
   with `FeeUtils.estimateTransactionFee`. Every transaction now pays 3.00 to
   3.03 sat/vB (`tests/fee-size.test.ts`). `FeeUtils.estimateFee` is kept,
   deprecated, because Solstice's builders still use it.

Every finding from this suite is now fixed. Each accepted transaction is also
checked to overpay by no more than about 1 vB per input, the allowance the
estimate makes for signature length.

Measured sizes, at 3 sat/vB:

| Transaction | vsize | Fee paid | sat/vB |
| --- | --- | --- | --- |
| Deposit (1 input, 5 outputs) | 298 | 894 | 3.00 |
| Claim, before branch | 192 | 579 | 3.02 |
| Claim, after branch | 193 | 579 | 3.00 |
| Distribute (1 input, 4 outputs) | 255 | 765 | 3.00 |
| Timelock spend, 2 inputs | 181 | 546 | 3.02 |
| Timelock spend, 1 input | 111 to 112 | 333 to 336 | 3.00 to 3.03 |
| Withdraw (escrow + timelock) | 293 | 882 | 3.01 |
| Funding (1 input, 2 outputs) | 153 | 459 | 3.00 |
