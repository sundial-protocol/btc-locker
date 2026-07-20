/**
 * C0 — Token Inscription (etching).
 *
 * Builds the one-time launch transaction that premines a receipt rune's entire
 * supply into the Receipt Vault. Output 0 is the vault-holding output and the
 * runestone's pointer targets it, so the full premine lands in the Vault. This is
 * a privileged operation guarded by the instance's admin/multisig signers.
 *
 * Reuses `@sundial-protocol/btc-locker` fee/UTXO/PSBT helpers; the only new
 * surface is the runestone OP_RETURN.
 */

import * as bitcoin from "bitcoinjs-lib";
import {
  FeeUtils,
  TransactionUtils,
  type UTXO,
} from "@sundial-protocol/btc-locker";
import type { ReceiptRune } from "../receipt/receipt-rune.js";
import { receiptEtching } from "../receipt/receipt-rune.js";
import type { RunestoneCodec } from "../runes/codec.js";
import { nativeRunestoneCodec } from "../runes/native-codec.js";
import { encipherGuarded } from "../runes/guard.js";
import type { Runestone } from "../runes/types.js";
import { DEFAULT_RUNE_OUTPUT_VALUE, type BuiltOutput } from "./types.js";

export interface EtchParams {
  /** The receipt rune to etch (its `id` is assigned by this transaction). */
  rune: ReceiptRune;
  /** Address that will hold the premined supply (the Receipt Vault). */
  vaultAddress: string;
  /** Sats attached to the vault-holding output (default 546). */
  vaultOutputValue?: number;
  /** BTC-funding inputs (pay the vault output + fee + change). */
  inputs: UTXO[];
  /** Fallback scriptPubKey for inputs lacking their own `scriptPubKey`. */
  sourceScript?: Buffer;
  /** Where BTC change is returned. */
  changeAddress?: string;
  /** Fee rate in sat/vByte. */
  feeRate: number;
  network: bitcoin.Network;
  /** Runestone codec (defaults to the native reference codec). */
  codec?: RunestoneCodec;
}

export interface EtchResult {
  psbtBase64: string;
  runestone: Runestone;
  runestoneScriptHex: string;
  fee: number;
  changeSats: number;
  outputs: BuiltOutput[];
}

/** Build the C0 etching PSBT. */
export function buildEtchTransaction(params: EtchParams): EtchResult {
  const {
    rune,
    vaultAddress,
    vaultOutputValue = DEFAULT_RUNE_OUTPUT_VALUE,
    inputs,
    sourceScript,
    changeAddress,
    feeRate,
    network,
    codec = nativeRunestoneCodec,
  } = params;

  if (inputs.length === 0) {
    throw new Error("etch: at least one funding input is required");
  }
  FeeUtils.assertAboveDust(vaultOutputValue, "Vault output value");

  // Premine → output 0; pointer targets output 0 so the Vault receives all supply.
  const runestone: Runestone = { etching: receiptEtching(rune), pointer: 0 };
  const runestoneScript = encipherGuarded(runestone, codec);

  const totalIn = sumValues(inputs);
  // Outputs: vault (0), runestone (1), optional change (2).
  const outputCountWithChange = 3;
  let fee = FeeUtils.estimateFee(inputs.length, outputCountWithChange, feeRate);
  let changeSats = totalIn - vaultOutputValue - fee;

  if (changeSats < 0) {
    throw new Error(
      `etch: insufficient funds. inputs=${totalIn}, vault=${vaultOutputValue}, fee=${fee}, short=${-changeSats}`,
    );
  }

  const emitChange =
    !!changeAddress && changeSats >= FeeUtils.DUST_THRESHOLD;
  if (!emitChange) {
    // Recompute fee without a change output; any sub-dust remainder goes to miner.
    fee = FeeUtils.estimateFee(inputs.length, 2, feeRate);
    changeSats = 0;
  }

  const psbt = new bitcoin.Psbt({ network });
  TransactionUtils.addWitnessInputs(psbt, inputs, sourceScript);

  const outputs: BuiltOutput[] = [];

  psbt.addOutput({ address: vaultAddress, value: BigInt(vaultOutputValue) });
  outputs.push({ role: "vault (premine)", address: vaultAddress, value: vaultOutputValue });

  psbt.addOutput({ script: runestoneScript, value: 0n });
  outputs.push({ role: "runestone", scriptHex: runestoneScript.toString("hex"), value: 0 });

  if (emitChange && changeAddress) {
    psbt.addOutput({ address: changeAddress, value: BigInt(changeSats) });
    outputs.push({ role: "btc change", address: changeAddress, value: changeSats });
  }

  return {
    psbtBase64: psbt.toBase64(),
    runestone,
    runestoneScriptHex: runestoneScript.toString("hex"),
    fee,
    changeSats,
    outputs,
  };
}

function sumValues(utxos: UTXO[]): number {
  return utxos.reduce((sum, u) => {
    if (!Number.isInteger(u.value) || u.value <= 0) {
      throw new Error("all input values must be positive integers");
    }
    return sum + u.value;
  }, 0);
}
