/**
 * C0, step 1 — the etching commitment.
 *
 * Runes indexers only accept an etching that names its rune if the etching
 * transaction also proves the name was committed to in advance: one of its
 * inputs must spend a taproot output by script path, the tapscript must contain
 * a data push of the rune's commitment bytes, and the transaction that created
 * that output must have at least {@link ETCH_COMMIT_CONFIRMATIONS} confirmations
 * when the etching confirms (ord: `tx_commits_to_rune`). Without it the etching
 * is ignored: no rune is created and the transaction is not even a cenotaph.
 *
 * So an etch is two transactions:
 *   1. commit — {@link buildEtchCommitTransaction} pays to the taproot output
 *      described by {@link createEtchCommitment};
 *   2. reveal — `buildEtchTransaction` spends it, six blocks later.
 */

import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import {
  FeeUtils,
  TransactionUtils,
  type UTXO,
} from "@sundial-protocol/btc-locker";
import type { ReceiptRune } from "../receipt/receipt-rune.js";
import { runeCommitment, runeNameToNumber } from "../runes/rune-name.js";
import { pushBytes } from "../runes/script.js";
import { DEFAULT_RUNE_OUTPUT_VALUE, type BuiltOutput } from "./types.js";

/**
 * Confirmations the commit transaction needs, counting the block that confirms
 * the etching: a commit in block `h` allows an etching in block `h + 5` or later.
 */
export const ETCH_COMMIT_CONFIRMATIONS = 6;

/** BIP-342 tapscript leaf version. */
const TAPSCRIPT_LEAF_VERSION = 0xc0;

const OP_FALSE = 0x00;
const OP_IF = 0x63;
const OP_ENDIF = 0x68;
const OP_CHECKSIG = 0xac;

/** The taproot output that commits to a rune name ahead of its etching. */
export interface EtchCommitment {
  /** x-only public key (hex) that signs the reveal; also the taproot internal key. */
  revealPublicKey: string;
  /** The tapscript leaf carrying the commitment, hex. */
  tapLeafScriptHex: string;
  /** Control block for spending by that leaf, hex. */
  controlBlockHex: string;
  /** scriptPubKey of the commit output, hex. */
  scriptPubKeyHex: string;
  /** Address of the commit output. */
  address: string;
}

function xOnly(publicKey: Uint8Array | string): Buffer {
  const key =
    typeof publicKey === "string" ? Buffer.from(publicKey, "hex") : Buffer.from(publicKey);
  if (key.length === 33 && (key[0] === 2 || key[0] === 3)) return key.subarray(1);
  if (key.length === 32) return key;
  throw new Error(
    "etch commit: revealPublicKey must be a 32-byte x-only or 33-byte compressed public key",
  );
}

/** A rune is a u128, so its commitment is at most 16 bytes. */
const MAX_COMMITMENT_LENGTH = 16;

/**
 * The leaf script: `<key> OP_CHECKSIG OP_FALSE OP_IF <commitment> OP_ENDIF`.
 *
 * The commitment sits in a branch that never runs, as in ord's own reveal
 * scripts. Indexers look for a data push equal to the commitment, so it is
 * written as a raw push: a script compiler would encode the one-byte values
 * 1..16 and 0x81 as opcodes, which are not pushes.
 *
 * The rune `A` is number 0 and has an empty commitment, pushed as a single zero
 * byte. The `OP_FALSE` before it is an empty push too, so for that one name the
 * leaf would match even without the commitment. The name is still bound to this
 * key and output, and `A` is far below any minimum name length.
 */
export function commitmentLeafScript(key: Buffer, commitment: Buffer): Buffer {
  if (key.length !== 32) {
    throw new Error("etch commit: the leaf key must be a 32-byte x-only public key");
  }
  if (commitment.length > MAX_COMMITMENT_LENGTH) {
    throw new Error(
      `etch commit: a rune commitment is at most ${MAX_COMMITMENT_LENGTH} bytes, got ${commitment.length}`,
    );
  }
  return Buffer.concat([
    pushBytes(key),
    Buffer.from([OP_CHECKSIG, OP_FALSE, OP_IF]),
    pushBytes(commitment),
    Buffer.from([OP_ENDIF]),
  ]);
}

/**
 * Describe the commit output for a rune name and a reveal key. Deterministic, so
 * the reveal builder can recompute it and the two always agree.
 *
 * `revealPublicKey` is also the taproot internal key: its holder can sweep an
 * unused commit output by key path.
 */
export function createEtchCommitment(
  rune: Pick<ReceiptRune, "name">,
  revealPublicKey: Uint8Array | string,
  network: bitcoin.Network,
): EtchCommitment {
  bitcoin.initEccLib(ecc);

  const key = xOnly(revealPublicKey);
  const leaf = commitmentLeafScript(key, runeCommitment(runeNameToNumber(rune.name)));
  const payment = bitcoin.payments.p2tr({
    internalPubkey: key,
    scriptTree: { output: leaf },
    redeem: { output: leaf, redeemVersion: TAPSCRIPT_LEAF_VERSION },
    network,
  });
  if (!payment.output || !payment.address || !payment.witness) {
    throw new Error("etch commit: could not derive the taproot output");
  }

  return {
    revealPublicKey: key.toString("hex"),
    tapLeafScriptHex: leaf.toString("hex"),
    controlBlockHex: Buffer.from(payment.witness[payment.witness.length - 1]).toString("hex"),
    scriptPubKeyHex: Buffer.from(payment.output).toString("hex"),
    address: payment.address,
  };
}

export interface EtchCommitParams {
  /** The receipt rune that will be etched. */
  rune: ReceiptRune;
  /**
   * Public key (x-only or compressed) that will sign the reveal. Whoever holds
   * it decides where the premine goes, so it belongs to the instance's admin.
   */
  revealPublicKey: Uint8Array | string;
  /**
   * Sats locked in the commit output. Defaults to what the reveal needs with no
   * other input: the vault output plus the reveal's fee at `feeRate`.
   */
  commitOutputValue?: number;
  /** Sats the reveal will attach to the vault output (default 546). */
  vaultOutputValue?: number;
  /** BTC-funding inputs. */
  inputs: UTXO[];
  /** Fallback scriptPubKey for inputs lacking their own `scriptPubKey`. */
  sourceScript?: Buffer;
  /** Where BTC change is returned. */
  changeAddress?: string;
  /** Fee rate in sat/vByte, used for this transaction and to size the commit output. */
  feeRate: number;
  network: bitcoin.Network;
}

export interface EtchCommitResult {
  psbtBase64: string;
  commitment: EtchCommitment;
  /** Index of the commit output in the transaction (always 0). */
  commitVout: number;
  /** Sats in the commit output. */
  commitOutputValue: number;
  fee: number;
  changeSats: number;
  outputs: BuiltOutput[];
}

/** Build the commit PSBT: output 0 is the taproot output the etching will spend. */
export function buildEtchCommitTransaction(params: EtchCommitParams): EtchCommitResult {
  const {
    rune,
    revealPublicKey,
    vaultOutputValue = DEFAULT_RUNE_OUTPUT_VALUE,
    inputs,
    sourceScript,
    changeAddress,
    feeRate,
    network,
  } = params;

  if (inputs.length === 0) {
    throw new Error("etch commit: at least one funding input is required");
  }
  // The reveal has one input and two outputs (vault, runestone).
  const commitOutputValue =
    params.commitOutputValue ?? vaultOutputValue + FeeUtils.estimateFee(1, 2, feeRate);
  FeeUtils.assertAboveDust(commitOutputValue, "Commit output value");

  const commitment = createEtchCommitment(rune, revealPublicKey, network);

  const totalIn = inputs.reduce((sum, u) => {
    if (!Number.isInteger(u.value) || u.value <= 0) {
      throw new Error("all input values must be positive integers");
    }
    return sum + u.value;
  }, 0);

  // Outputs: commit (0), optional change (1). The transaction is affordable if
  // it covers the fee without a change output; change is added only when what
  // is left after the larger, with-change fee is above dust.
  const remainder = totalIn - commitOutputValue;
  const feeWithoutChange = FeeUtils.estimateFee(inputs.length, 1, feeRate);
  if (remainder < feeWithoutChange) {
    throw new Error(
      `etch commit: insufficient funds. inputs=${totalIn}, commit=${commitOutputValue}, fee=${feeWithoutChange}, short=${feeWithoutChange - remainder}`,
    );
  }
  let fee = FeeUtils.estimateFee(inputs.length, 2, feeRate);
  let changeSats = remainder - fee;
  const emitChange = !!changeAddress && changeSats >= FeeUtils.DUST_THRESHOLD;
  if (!emitChange) {
    // Whatever is left after the commit output goes to the miner.
    fee = remainder;
    changeSats = 0;
  }

  const psbt = new bitcoin.Psbt({ network });
  TransactionUtils.addWitnessInputs(psbt, inputs, sourceScript);

  const outputs: BuiltOutput[] = [];
  psbt.addOutput({
    script: Buffer.from(commitment.scriptPubKeyHex, "hex"),
    value: BigInt(commitOutputValue),
  });
  outputs.push({ role: "etch commit", address: commitment.address, value: commitOutputValue });

  if (emitChange && changeAddress) {
    psbt.addOutput({ address: changeAddress, value: BigInt(changeSats) });
    outputs.push({ role: "btc change", address: changeAddress, value: changeSats });
  }

  return {
    psbtBase64: psbt.toBase64(),
    commitment,
    commitVout: 0,
    commitOutputValue,
    fee,
    changeSats,
    outputs,
  };
}
