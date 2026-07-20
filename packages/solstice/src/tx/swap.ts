/**
 * Atomic BTC ⇄ receipt-token swap — the single builder behind both C1 (Investment)
 * and C2 (Standard Withdrawal).
 *
 * Both flows are the same shape: one Bitcoin transaction that moves BTC from one
 * party to another **and** moves receipt tokens the other way, settling as a unit
 * so no one can hold a signed transaction and settle later against a stale ratio
 * (spec §7.1). Rather than build two near-identical transactions, this module
 * builds the general swap once and exposes thin role-mapping adapters:
 *
 *   • Invest (C1):   RT from Vault → user;   BTC from user → YP deployment address.
 *   • Withdraw (C2): RT from user  → Vault;  BTC from Buffer → user.
 *
 * The receipt-token leg is a runestone edict; leftover rune balance (rune change)
 * is directed to a change output via the runestone pointer. All rune amounts are
 * base units; pricing (RT = BTC / ratio, and its inverse) is the caller's job —
 * this builder only moves the amounts it is given, atomically.
 */

import * as bitcoin from "bitcoinjs-lib";
import {
  FeeUtils,
  TransactionUtils,
  type UTXO,
} from "@sundial-protocol/btc-locker";
import {
  receiptEdict,
  requireEtched,
  type ReceiptRune,
} from "../receipt/receipt-rune.js";
import type { RunestoneCodec } from "../runes/codec.js";
import { nativeRunestoneCodec } from "../runes/native-codec.js";
import { encipherGuarded } from "../runes/guard.js";
import type { Runestone } from "../runes/types.js";
import {
  DEFAULT_RUNE_OUTPUT_VALUE,
  type BuiltOutput,
  type RuneUtxo,
} from "./types.js";

/** One side of the swap: the receipt-token (rune) leg. */
export interface RtLeg {
  /** UTXOs carrying the receipt rune (the source of the moved runes). */
  inputs: RuneUtxo[];
  /** Rune amount delivered to the recipient (base units). */
  amount: bigint;
  /** Who receives the moved runes. */
  recipientAddress: string;
  /** Who receives leftover rune balance (rune change). */
  changeAddress: string;
  /** Fallback scriptPubKey for rune inputs lacking their own. */
  sourceScript?: Buffer;
}

/** The other side of the swap: the BTC leg. */
export interface BtcLeg {
  /** BTC-funding inputs. */
  inputs: UTXO[];
  /** Sats delivered to the BTC recipient. */
  amount: number;
  /** Who receives the BTC. */
  recipientAddress: string;
  /** Who receives BTC change (optional). */
  changeAddress?: string;
  /** Fallback scriptPubKey for BTC inputs lacking their own. */
  sourceScript?: Buffer;
}

export interface SwapParams {
  /** The (etched) receipt rune being moved. */
  rune: ReceiptRune;
  rt: RtLeg;
  btc: BtcLeg;
  feeRate: number;
  network: bitcoin.Network;
  /** Sats attached to each rune-carrying output (default 546). */
  runeOutputValue?: number;
  codec?: RunestoneCodec;
}

export interface SwapResult {
  psbtBase64: string;
  runestone: Runestone;
  runestoneScriptHex: string;
  fee: number;
  /** Leftover rune balance directed to the rune-change output (0 if none). */
  runeChange: bigint;
  /** BTC change in sats (0 if none emitted). */
  btcChangeSats: number;
  outputs: BuiltOutput[];
}

/**
 * Build the generic atomic swap PSBT. Output order is fixed and deterministic so
 * edict/pointer indices are stable:
 *   [0] RT recipient · [1] RT change (if any) · BTC recipient · runestone · BTC change (if any)
 */
export function buildSwapTransaction(params: SwapParams): SwapResult {
  const {
    rune,
    rt,
    btc,
    feeRate,
    network,
    runeOutputValue = DEFAULT_RUNE_OUTPUT_VALUE,
    codec = nativeRunestoneCodec,
  } = params;

  requireEtched(rune);
  if (rt.inputs.length === 0) throw new Error("swap: rt.inputs is empty");
  if (btc.inputs.length === 0) throw new Error("swap: btc.inputs is empty");
  if (rt.amount <= 0n) throw new Error("swap: rt.amount must be positive");
  if (!Number.isInteger(btc.amount) || btc.amount <= 0) {
    throw new Error("swap: btc.amount must be a positive integer");
  }
  FeeUtils.assertAboveDust(runeOutputValue, "Rune output value");
  FeeUtils.assertAboveDust(btc.amount, "BTC recipient amount");

  const totalRunesIn = rt.inputs.reduce((s, u) => s + u.runeAmount, 0n);
  if (rt.amount > totalRunesIn) {
    throw new Error(
      `swap: rt.amount ${rt.amount} exceeds available rune balance ${totalRunesIn}`,
    );
  }
  const runeChange = totalRunesIn - rt.amount;
  const hasRuneChange = runeChange > 0n;

  // ── Output indices (fixed order) ───────────────────────────────────────────
  const idxRtRecipient = 0;
  const idxRtChange = hasRuneChange ? 1 : -1;
  // BTC recipient follows the rune outputs; the runestone follows the BTC
  // recipient; BTC change (if any) comes last. Those outputs are appended in
  // order below, so their indices are implicit.

  // Unallocated runes (the change) follow the pointer; the edict delivers the
  // requested amount to the recipient output.
  const runestone: Runestone = {
    edicts: [receiptEdict(rune, rt.amount, idxRtRecipient)],
    pointer: hasRuneChange ? idxRtChange : idxRtRecipient,
  };
  const runestoneScript = encipherGuarded(runestone, codec);

  // ── Sats accounting ────────────────────────────────────────────────────────
  const numRuneOutputs = hasRuneChange ? 2 : 1;
  const satsIn =
    sumValues(rt.inputs) + sumValues(btc.inputs);
  const runeOutputsSats = runeOutputValue * numRuneOutputs;

  // Estimate assuming a BTC change output exists, then drop it if sub-dust.
  const totalInputCount = rt.inputs.length + btc.inputs.length;
  const outputCountWithChange =
    numRuneOutputs + 1 /* btc recipient */ + 1 /* runestone */ + 1 /* btc change */;
  let fee = FeeUtils.estimateFee(totalInputCount, outputCountWithChange, feeRate);
  let btcChangeSats = satsIn - runeOutputsSats - btc.amount - fee;

  if (btcChangeSats < 0) {
    throw new Error(
      `swap: insufficient BTC. in=${satsIn}, runeOutputs=${runeOutputsSats}, btcOut=${btc.amount}, fee=${fee}, short=${-btcChangeSats}`,
    );
  }

  const emitBtcChange =
    !!btc.changeAddress && btcChangeSats >= FeeUtils.DUST_THRESHOLD;
  if (!emitBtcChange) {
    fee = FeeUtils.estimateFee(totalInputCount, outputCountWithChange - 1, feeRate);
    btcChangeSats = 0;
  }

  // ── Build PSBT ─────────────────────────────────────────────────────────────
  const psbt = new bitcoin.Psbt({ network });
  TransactionUtils.addWitnessInputs(psbt, rt.inputs, rt.sourceScript);
  TransactionUtils.addWitnessInputs(psbt, btc.inputs, btc.sourceScript);

  const outputs: BuiltOutput[] = [];

  psbt.addOutput({ address: rt.recipientAddress, value: BigInt(runeOutputValue) });
  outputs.push({ role: "rt recipient", address: rt.recipientAddress, value: runeOutputValue });

  if (hasRuneChange) {
    psbt.addOutput({ address: rt.changeAddress, value: BigInt(runeOutputValue) });
    outputs.push({ role: "rt change", address: rt.changeAddress, value: runeOutputValue });
  }

  psbt.addOutput({ address: btc.recipientAddress, value: BigInt(btc.amount) });
  outputs.push({ role: "btc recipient", address: btc.recipientAddress, value: btc.amount });

  psbt.addOutput({ script: runestoneScript, value: 0n });
  outputs.push({ role: "runestone", scriptHex: runestoneScript.toString("hex"), value: 0 });

  if (emitBtcChange && btc.changeAddress) {
    psbt.addOutput({ address: btc.changeAddress, value: BigInt(btcChangeSats) });
    outputs.push({ role: "btc change", address: btc.changeAddress, value: btcChangeSats });
  }

  return {
    psbtBase64: psbt.toBase64(),
    runestone,
    runestoneScriptHex: runestoneScript.toString("hex"),
    fee,
    runeChange,
    btcChangeSats,
    outputs,
  };
}

// ── Role-mapping adapters (C1 / C2) ──────────────────────────────────────────

/** Parameters for C1 Investment, mapped onto the generic swap. */
export interface InvestParams {
  rune: ReceiptRune;
  /** Vault RT UTXOs (source of issued receipt tokens). */
  vaultRtInputs: RuneUtxo[];
  /** Receipt tokens issued to the investor: `RT = BTC / ClaimRatio` (caller-priced). */
  rtAmount: bigint;
  /** Where the investor receives RT (their wallet, or a C1.1 timelock script). */
  investorRtAddress: string;
  /** Vault address that keeps the unissued RT remainder. */
  vaultRtChangeAddress: string;
  /** Investor's BTC inputs. */
  investorBtcInputs: UTXO[];
  /** BTC deployed to the YP (the profile's deployment destination). */
  btcAmount: number;
  /** YP deployment address (BTC-returning wallet, or asset-backed subscription address). */
  ypDeploymentAddress: string;
  /** Investor's BTC change address. */
  investorBtcChangeAddress?: string;
  feeRate: number;
  network: bitcoin.Network;
  runeOutputValue?: number;
  vaultRtScript?: Buffer;
  investorBtcScript?: Buffer;
  codec?: RunestoneCodec;
}

/** Build a C1 Investment as an atomic swap (RT Vault→investor, BTC investor→YP). */
export function buildInvestTransaction(params: InvestParams): SwapResult {
  return buildSwapTransaction({
    rune: params.rune,
    rt: {
      inputs: params.vaultRtInputs,
      amount: params.rtAmount,
      recipientAddress: params.investorRtAddress,
      changeAddress: params.vaultRtChangeAddress,
      sourceScript: params.vaultRtScript,
    },
    btc: {
      inputs: params.investorBtcInputs,
      amount: params.btcAmount,
      recipientAddress: params.ypDeploymentAddress,
      changeAddress: params.investorBtcChangeAddress,
      sourceScript: params.investorBtcScript,
    },
    feeRate: params.feeRate,
    network: params.network,
    runeOutputValue: params.runeOutputValue,
    codec: params.codec,
  });
}

/** Parameters for C2 Standard Withdrawal, mapped onto the generic swap. */
export interface WithdrawParams {
  rune: ReceiptRune;
  /** Investor's RT UTXOs being redeemed. */
  userRtInputs: RuneUtxo[];
  /** RT returned to the Vault: the full redeemed amount. */
  rtAmount: bigint;
  /** Vault address that receives the returned RT. */
  vaultRtAddress: string;
  /** Investor's RT change address (for partial redemptions). */
  userRtChangeAddress: string;
  /** Liquidity Buffer BTC inputs. */
  bufferBtcInputs: UTXO[];
  /** BTC paid to the investor: `BTC = RT × ClaimRatio − fees` (caller-priced). */
  btcAmount: number;
  /** Investor's payout address. */
  userBtcAddress: string;
  /** Buffer BTC change address. */
  bufferBtcChangeAddress?: string;
  feeRate: number;
  network: bitcoin.Network;
  runeOutputValue?: number;
  userRtScript?: Buffer;
  bufferBtcScript?: Buffer;
  codec?: RunestoneCodec;
}

/** Build a C2 Standard Withdrawal as an atomic swap (RT user→Vault, BTC Buffer→user). */
export function buildWithdrawTransaction(params: WithdrawParams): SwapResult {
  return buildSwapTransaction({
    rune: params.rune,
    rt: {
      inputs: params.userRtInputs,
      amount: params.rtAmount,
      recipientAddress: params.vaultRtAddress,
      changeAddress: params.userRtChangeAddress,
      sourceScript: params.userRtScript,
    },
    btc: {
      inputs: params.bufferBtcInputs,
      amount: params.btcAmount,
      recipientAddress: params.userBtcAddress,
      changeAddress: params.bufferBtcChangeAddress,
      sourceScript: params.bufferBtcScript,
    },
    feeRate: params.feeRate,
    network: params.network,
    runeOutputValue: params.runeOutputValue,
    codec: params.codec,
  });
}

function sumValues(utxos: UTXO[]): number {
  return utxos.reduce((sum, u) => {
    if (!Number.isInteger(u.value) || u.value <= 0) {
      throw new Error("all input values must be positive integers");
    }
    return sum + u.value;
  }, 0);
}
