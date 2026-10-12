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
`networkType` and `provider`, cast to `BitcoinAPI`.

`FeeUtils.queryChainFeeRates` is replaced with a fixed 3 sat/vB for the run,
because regtest has no fee market and two builders would otherwise ask
mempool.space (see below).

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

Not fixed:

3. **Distribute and withdraw ask for mainnet fee rates on every network.** They
   call `FeeUtils.queryChainFeeRates(priority)` without the network, and the
   default is mainnet. Deposit and claim pass the network. None of the four uses
   the injected API for fees: `queryChainFeeRates` always creates its own
   `BitcoinAPI`.
4. **Claim and withdraw do not count the metadata output in the fee.** A claim
   to a P2WPKH address with metadata is 192 to 193 vB against an estimate of 194,
   so it passes by one or two bytes. To a P2WSH or taproot address it would be
   about 12 vB larger and pay slightly under the target rate.
5. **Builders compare the locktime with the clock; consensus does not.** For a
   block-height locktime the guard always passes. For a time-based one, the
   builder allows the spend as soon as the clock passes the deadline, and nodes
   reject it as non-final until the median time past does, about an hour later
   on mainnet.
6. **`estimateFee` assumes 150 bytes per input.** Real inputs here are 68 to 111
   vB, so transactions paid 3.0 to 5.7 sat/vB against a target of 3.

Measured sizes, at 3 sat/vB:

| Transaction | vsize | Estimated size | Fee paid | sat/vB |
| --- | --- | --- | --- | --- |
| Deposit (1 input, 5 outputs) | 298 | 330 | 990 | 3.32 |
| Claim, before branch | 192 | 194 | 582 | 3.03 |
| Claim, after branch | 193 | 194 | 582 | 3.02 |
| Distribute (1 input, 4 outputs) | 255 | 296 | 888 | 3.48 |
| Timelock spend, 2 inputs | 181 | 344 | 1032 | 5.70 |
| Timelock spend, 1 input | 112 | 194 | 582 | 5.20 |
| Withdraw (escrow + timelock) | 293 | 378 | 1134 | 3.87 |
| Funding (1 input, 2 outputs) | 153 | 228 | 684 | 4.47 |
