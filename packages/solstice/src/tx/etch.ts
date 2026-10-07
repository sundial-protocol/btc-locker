/**
 * C0, step 2 — Token Inscription (etching).
 *
 * Builds the one-time launch transaction that premines a receipt rune's entire
 * supply into the Receipt Vault. Output 0 is the vault-holding output and the
 * runestone's pointer targets it, so the full premine lands in the Vault. This is
 * a privileged operation guarded by the instance's admin/multisig signers.
 *
 * Input 0 spends the commit output built by `buildEtchCommitTransaction`, by
 * script path, which reveals the commitment to the rune name. Indexers ignore the
 * etching unless the commit transaction has {@link ETCH_COMMIT_CONFIRMATIONS}
 * confirmations by the time this one confirms, so broadcast it no earlier than
 * five blocks after the commit confirmed.
 *
 * Reuses `@sundial-protocol/btc-locker` fee/UTXO/PSBT helpers.
 */

import * as bitcoin from "bitcoinjs-lib";
import {
  FeeUtils,
  TransactionUtils,
  type UTXO,
} from "@sundial-protocol/btc-locker";
import { receiptEtching, type ReceiptRune } from "../receipt/receipt-rune.js";
import type { RunestoneCodec } from "../runes/codec.js";
import { nativeRunestoneCodec } from "../runes/native-codec.js";
import { encipherGuarded } from "../runes/guard.js";
import type { Runestone } from "../runes/types.js";
import { createEtchCommitment } from "./etch-commit.js";
import { DEFAULT_RUNE_OUTPUT_VALUE, type BuiltOutput } from "./types.js";

/** BIP-342 tapscript leaf version. */
const TAPSCRIPT_LEAF_VERSION = 0xc0;

/** The confirmed commit output the etching spends. */
export interface EtchCommitInput {
  txid: string;
  vout: number;
  /** Sats in the commit output. */
  value: number;
  /** The key the commitment was created for (x-only or compressed). */
  revealPublicKey: Uint8Array | string;
}

export interface EtchParams {
  /** The receipt rune to etch (its `id` is assigned by this transaction). */
  rune: ReceiptRune;
  /** Address that will hold the premined supply (the Receipt Vault). */
  vaultAddress: string;
  /** Sats attached to the vault-holding output (default 546). */
  vaultOutputValue?: number;
  /**
   * The commit output for this rune, from `buildEtchCommitTransaction`. It must
   * have 6 confirmations when the etching confirms.
   */
  commit: EtchCommitInput;
  /**
   * Extra BTC-funding inputs, if the commit output does not cover the vault
   * output and the fee. Not needed with the default commit output value.
   */
  inputs?: UTXO[];
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

/**
 * Build the C0 etching PSBT. Input 0 is the commit output and needs a Schnorr
 * signature for the tapscript leaf from the reveal key; any extra inputs follow.
 */
export function buildEtchTransaction(params: EtchParams): EtchResult {
  const {
    rune,
    vaultAddress,
    vaultOutputValue = DEFAULT_RUNE_OUTPUT_VALUE,
    commit,
    inputs = [],
    sourceScript,
    changeAddress,
    feeRate,
    network,
    codec = nativeRunestoneCodec,
  } = params;

  FeeUtils.assertAboveDust(vaultOutputValue, "Vault output value");

  // Recomputed from the rune and the key, so the leaf revealed here always
  // commits to the name being etched.
  const commitment = createEtchCommitment(rune, commit.revealPublicKey, network);

  // Premine → output 0; pointer targets output 0 so the Vault receives all supply.
  const runestone: Runestone = { etching: receiptEtching(rune), pointer: 0 };
  const runestoneScript = encipherGuarded(runestone, codec, { outputCount: 2 });

  const totalIn = sumValues([commit, ...inputs]);
  const inputCount = 1 + inputs.length;
  // Outputs: vault (0), runestone (1), optional change (2).
  let fee = FeeUtils.estimateFee(inputCount, 3, feeRate);
  let changeSats = totalIn - vaultOutputValue - fee;

  const emitChange = !!changeAddress && changeSats >= FeeUtils.DUST_THRESHOLD;
  if (!emitChange) {
    // No change output: everything above the vault output is the fee.
    fee = totalIn - vaultOutputValue;
    changeSats = 0;
    const needed = FeeUtils.estimateFee(inputCount, 2, feeRate);
    if (fee < needed) {
      throw new Error(
        `etch: insufficient funds. inputs=${totalIn}, vault=${vaultOutputValue}, fee=${needed}, short=${needed - fee}`,
      );
    }
  }

  const psbt = new bitcoin.Psbt({ network });
  const revealKey = Buffer.from(commitment.revealPublicKey, "hex");
  psbt.addInput({
    hash: commit.txid,
    index: commit.vout,
    witnessUtxo: {
      script: Buffer.from(commitment.scriptPubKeyHex, "hex"),
      value: BigInt(commit.value),
    },
    tapInternalKey: revealKey,
    tapLeafScript: [
      {
        leafVersion: TAPSCRIPT_LEAF_VERSION,
        script: Buffer.from(commitment.tapLeafScriptHex, "hex"),
        controlBlock: Buffer.from(commitment.controlBlockHex, "hex"),
      },
    ],
  });
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

function sumValues(utxos: Array<{ value: number }>): number {
  return utxos.reduce((sum, u) => {
    if (!Number.isInteger(u.value) || u.value <= 0) {
      throw new Error("all input values must be positive integers");
    }
    return sum + u.value;
  }, 0);
}
