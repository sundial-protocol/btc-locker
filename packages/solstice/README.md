# @sundial-protocol/solstice

Receipt-token (Runes) + atomic-swap layer for the **Solstice value-accrual vault**.

This package is the greenfield token/swap layer called for in the Solstice
Technical Specification. It **reuses** `@sundial-protocol/btc-locker` for scripts,
PSBT construction, fee/UTXO logic and signing, and **adds** the two things
btc-locker does not have: a Runes receipt token and an atomic BTC⇄RT swap.

## What it does

| Spec component | Export | Notes |
| --- | --- | --- |
| **C0** Token Inscription | `buildEtchTransaction` | Premines the full fixed supply into the Vault; pointer targets the Vault output. |
| **C1** Investment | `buildInvestTransaction` | RT Vault→investor, BTC investor→YP, in one atomic tx. |
| **C2** Standard Withdrawal | `buildWithdrawTransaction` | RT user→Vault, BTC Buffer→user, in one atomic tx. |
| Generic swap | `buildSwapTransaction` | The single builder behind both C1 and C2. |
| Cenotaph guard | `encipherGuarded` | Round-trips every runestone before signing (Runes decision record requirement). |
| Runestone codec | `RunestoneCodec` / `NativeRunestoneCodec` | Pluggable; native reference impl included. |
| Receipt rune (per-instance) | `ReceiptRune` | One per Solstice instance; each brands its own receipt Rune. |

## Design decisions

**One swap builder for C1 and C2.** Investment and withdrawal are the same
transaction shape — move BTC one way and receipt tokens the other, atomically.
`buildSwapTransaction` implements it once; `buildInvestTransaction` /
`buildWithdrawTransaction` are thin role-mapping adapters. YP _type_
(BTC-returning vs asset-backed) never reaches this layer: it only changes the BTC
deployment destination, which is a plain address parameter.

**Multi-instance by construction.** Every builder takes a `ReceiptRune`, so a
single code path serves every instance. Nothing here is instance-specific.

**Pluggable runestone codec.** The Runes decision record leaves the production
encode/decode library an open item (security review of
`@magiceden-oss/runestone-lib` vs `runelib`). Callers depend only on the
`RunestoneCodec` interface, so the reviewed library can be dropped in later via an
adapter without touching any builder. A `NativeRunestoneCodec` ships now so the
package is functional and testable today.

## Usage

```ts
import * as bitcoin from "bitcoinjs-lib";
import {
  buildEtchTransaction,
  buildInvestTransaction,
  buildWithdrawTransaction,
  type ReceiptRune,
} from "@sundial-protocol/solstice";

const exampleRune: ReceiptRune = {
  name: "EXAMPLERUNE",          // on-chain A–Z name (no spacers)
  displayTicker: "RT",          // UX only
  divisibility: 8,
  symbol: 0x24,
  totalSupply: 2_100_000_000_000_000n,
  // `id` is assigned by the C0 etch and frozen thereafter.
};

// C0 — etch (premine → Vault)
const etch = buildEtchTransaction({
  rune: exampleRune,
  vaultAddress,
  inputs: fundingUtxos,
  changeAddress,
  feeRate,
  network: bitcoin.networks.bitcoin,
});
// → sign with the Vault admin/multisig signer (btc-locker), then broadcast.

// After the etch confirms, set exampleRune.id = { block, tx } from the etching tx.

// C1 — invest (priced by the caller: rtAmount = BTC / ClaimRatio)
const invest = buildInvestTransaction({
  rune: { ...exampleRune, id: etchedId },
  vaultRtInputs, rtAmount, investorRtAddress, vaultRtChangeAddress,
  investorBtcInputs, btcAmount, ypDeploymentAddress, investorBtcChangeAddress,
  feeRate, network: bitcoin.networks.bitcoin,
});

// C2 — withdraw (priced by the caller: btcAmount = RT × ClaimRatio − fees)
const withdraw = buildWithdrawTransaction({
  rune: { ...exampleRune, id: etchedId },
  userRtInputs, rtAmount, vaultRtAddress, userRtChangeAddress,
  bufferBtcInputs, btcAmount, userBtcAddress, bufferBtcChangeAddress,
  feeRate, network: bitcoin.networks.bitcoin,
});
```

Each builder returns a `psbtBase64` plus the decoded runestone and an output plan.
**Pricing is the caller's responsibility** — these builders only move the amounts
they are given, atomically. Server-submit (spec §7.1) is enforced by the calling
service, not here.

## Scope / not done

- The native codec targets **round-trip correctness for self-produced runestones**
  (what the pre-sign guard needs), not full adversarial cenotaph classification of
  arbitrary third-party runestones — that is the reviewed library's job.
- Timelock variants (C1.1 Release, C2.3 Reservation) are **not** built here yet;
  they reuse btc-locker's timelock scripts and are the next increment.
- No live-chain/regtest exercise yet — builders are unit-tested against parsed
  PSBTs and decoded runestones, not broadcast.

## Test & build

```
npm test        --workspace @sundial-protocol/solstice   # 31 tests
npm run build   --workspace @sundial-protocol/solstice   # esm + cjs
npm run type-check --workspace @sundial-protocol/solstice
```
