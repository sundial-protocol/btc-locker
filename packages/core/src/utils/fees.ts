import { FeePriorities } from "@sundial-protocol/btc-provider";
import * as bitcoin from "bitcoinjs-lib";

/** An input to size: the script it spends and whatever the spend reveals. */
export interface SizedInput {
  /** The scriptPubKey of the output being spent. */
  scriptPubKey: Uint8Array;
  /** The witness script, for a P2WSH output or a P2SH-wrapped one. */
  witnessScript?: Uint8Array;
  /**
   * The redeem script, for a P2SH output. Without it a P2SH input is taken as
   * P2SH-P2WPKH, the nested segwit address wallets give out.
   */
  redeemScript?: Uint8Array;
  /**
   * The public key that signs, for a P2PKH output. Without it the key is
   * taken as uncompressed (65 bytes), the larger of the two.
   */
  publicKey?: Uint8Array;
}

/** What spending a script pushes besides the script itself, on its costliest path. */
interface ScriptSpend {
  /** Signatures. */
  signatures: number;
  /** Whether OP_CHECKMULTISIG needs its extra empty item. */
  multisigDummy: boolean;
  /** Branch selectors, one per OP_IF or OP_NOTIF on the path. */
  selectors: number;
}

/** Bytes to encode `n` as a Bitcoin CompactSize. */
function compactSizeLength(n: number): number {
  return n < 0xfd ? 1 : n <= 0xffff ? 3 : n <= 0xffffffff ? 5 : 9;
}

/** A pushed item in a witness: its length prefix and its bytes. */
const witnessItem = (length: number) => compactSizeLength(length) + length;

/** Outpoint (36), scriptSig length (1), sequence (4): an input with an empty scriptSig. */
const SEGWIT_INPUT_BYTES = 41;
/** An ECDSA signature with its sighash byte, at its largest. */
const ECDSA_SIGNATURE = 73;
/** A Schnorr signature with a sighash byte other than the default. */
const SCHNORR_SIGNATURE = 65;
/** A compressed public key. */
const PUBLIC_KEY = 33;
/** An uncompressed public key. */
const UNCOMPRESSED_PUBLIC_KEY = 65;

/** Bytes a script uses to push `length` bytes of data. */
function pushLength(length: number): number {
  if (length < 0x4c) return 1 + length;
  if (length <= 0xff) return 2 + length;
  if (length <= 0xffff) return 3 + length;
  return 5 + length;
}

/** OP_0 <20 bytes>: a P2WPKH output or witness program. */
const isP2wpkh = (s: Uint8Array) =>
  s.length === 22 && s[0] === 0x00 && s[1] === 0x14;
/** OP_0 <32 bytes>: a P2WSH output or witness program. */
const isP2wsh = (s: Uint8Array) =>
  s.length === 34 && s[0] === 0x00 && s[1] === 0x20;

// Fee priorities and the chain fee lookup live in @sundial-protocol/btc-provider:
// ask a `BitcoinAPI` with `api.queryChainFeeRates(priority)`.
export { FeePriorities };

/**
 * The locker's fallback chain fee rates (sat/vB), for when no fee provider
 * answers. The provider package has none of its own: the locker's
 * `BitcoinAPI` passes these to it.
 */
export const DEFAULT_CHAIN_FEE_RATES = {
  fastestFee: 20,
  halfHourFee: 15,
  hourFee: 10,
  economyFee: 5,
  minimumFee: 1,
};

/** {@link DEFAULT_CHAIN_FEE_RATES} by priority, as the provider takes them. */
export const FALLBACK_FEE_RATES: Record<FeePriorities, number> = {
  [FeePriorities.HIGH]: DEFAULT_CHAIN_FEE_RATES.fastestFee,
  [FeePriorities.MEDIUM]: DEFAULT_CHAIN_FEE_RATES.hourFee,
  [FeePriorities.LOW]: DEFAULT_CHAIN_FEE_RATES.economyFee,
};

/**
 * Fee calculation and transaction utilities
 */
export default class FeeUtils {
  /**
   * Standard dust threshold for Bitcoin (546 satoshis)
   */
  static readonly DUST_THRESHOLD = 546;

  /**
   * Default transaction fee (1000 satoshis)
   */
  static readonly DEFAULT_FEE = 1000;

  /**
   * Fallback chain fee rates (sat/vB) used when a fee estimation API is unavailable.
   * Shared so all fallbacks (core and consumers) stay in sync.
   */
  static readonly DEFAULT_CHAIN_FEE_RATES = DEFAULT_CHAIN_FEE_RATES;

  /**
   * Assert that an amount is above the dust threshold
   * @param amount - Amount in satoshis
   * @param label - Human-readable label for the amount (e.g. "Escrow amount")
   * @param hint - Optional hint appended to the error message
   * @throws If amount is below dust threshold
   */
  static assertAboveDust(amount: number, label: string, hint?: string): void {
    if (amount < this.DUST_THRESHOLD) {
      const suffix = hint ? `. ${hint}` : "";
      throw new Error(
        `${label} ${amount} is below dust threshold ${this.DUST_THRESHOLD}${suffix}`,
      );
    }
  }

  /**
   * Calculate change amount and determine if it's above dust threshold
   * @param totalInputValue - Total value of inputs
   * @param outputValue - Value to send
   * @param feeAmount - Transaction fee
   * @returns Change calculation result
   */
  static calculateChange(
    totalInputValue: number,
    outputValue: number,
    feeAmount: number = this.DEFAULT_FEE,
  ): {
    changeAmount: number;
    isAboveDustThreshold: boolean;
    adjustedFee: number;
  } {
    const changeAmount = totalInputValue - outputValue - feeAmount;
    const isAboveDustThreshold = changeAmount > this.DUST_THRESHOLD;

    // If change is below dust threshold but positive, add it to fee
    let adjustedFee = feeAmount;
    if (changeAmount > 0 && changeAmount <= this.DUST_THRESHOLD) {
      adjustedFee += changeAmount;
    }

    return {
      changeAmount: isAboveDustThreshold ? changeAmount : 0,
      isAboveDustThreshold,
      adjustedFee,
    };
  }

  /**
   * Weight of one input, in weight units, from the output it spends. Assumes
   * the largest signature, so an estimate is never short.
   *
   * - P2WPKH: 273 (68.25 vB).
   * - P2TR key path: 231 (57.75 vB).
   * - P2WSH: from the witness script, on its costliest path: a signature per
   *   signature check (the required count for OP_CHECKMULTISIG, plus its
   *   empty item) and a branch selector per OP_IF or OP_NOTIF. Without the
   *   witness script, 150 vB.
   * - P2SH: from the redeem script, as nested P2WPKH, nested P2WSH (which
   *   also needs the witness script) or a legacy script spend. Without the
   *   redeem script, taken as P2SH-P2WPKH: 365 (91.25 vB).
   * - P2PKH: 597 (149.25 vB) with a compressed key, 725 (181.25 vB) with an
   *   uncompressed one, which is assumed when `publicKey` is not given.
   * - Anything else: 150 vB.
   *
   * Inputs without a witness include the one-byte empty witness they carry
   * when the transaction also has segwit inputs.
   */
  static inputWeight(input: SizedInput): number {
    const script = input.scriptPubKey;
    const nonWitness = (scriptSigLength: number) =>
      4 *
      (SEGWIT_INPUT_BYTES -
        1 +
        compactSizeLength(scriptSigLength) +
        scriptSigLength);
    const fallback = 4 * 150;
    const p2wpkhWitness =
      1 + witnessItem(ECDSA_SIGNATURE) + witnessItem(PUBLIC_KEY);
    const p2wshWitness = (witnessScript: Uint8Array) => {
      const spend = this.scriptSpend(witnessScript);
      const items = [
        ...Array<number>(spend.signatures).fill(witnessItem(ECDSA_SIGNATURE)),
        ...(spend.multisigDummy ? [witnessItem(0)] : []),
        ...Array<number>(spend.selectors).fill(witnessItem(1)),
        witnessItem(witnessScript.length),
      ];
      return (
        compactSizeLength(items.length) +
        items.reduce((sum, item) => sum + item, 0)
      );
    };

    if (isP2wpkh(script)) {
      return nonWitness(0) + p2wpkhWitness;
    }
    // OP_1 <32 bytes>
    if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20) {
      return nonWitness(0) + 1 + witnessItem(SCHNORR_SIGNATURE);
    }
    if (isP2wsh(script)) {
      if (!input.witnessScript) return fallback;
      return nonWitness(0) + p2wshWitness(input.witnessScript);
    }
    // OP_HASH160 <20 bytes> OP_EQUAL
    if (script.length === 23 && script[0] === 0xa9 && script[22] === 0x87) {
      const redeem = input.redeemScript;
      if (!redeem || isP2wpkh(redeem)) {
        return nonWitness(pushLength(22)) + p2wpkhWitness;
      }
      if (isP2wsh(redeem)) {
        if (!input.witnessScript) return fallback;
        return nonWitness(pushLength(34)) + p2wshWitness(input.witnessScript);
      }
      // Legacy script spend: the signatures, OP_0 for CHECKMULTISIG, one
      // opcode per branch selector and the redeem script, all in the scriptSig.
      const spend = this.scriptSpend(redeem);
      const scriptSig =
        spend.signatures * pushLength(ECDSA_SIGNATURE) +
        (spend.multisigDummy ? 1 : 0) +
        spend.selectors +
        pushLength(redeem.length);
      return nonWitness(scriptSig) + 1;
    }
    // OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
    if (script.length === 25 && script[0] === 0x76 && script[24] === 0xac) {
      const keyLength = input.publicKey?.length ?? UNCOMPRESSED_PUBLIC_KEY;
      return (
        nonWitness(pushLength(ECDSA_SIGNATURE) + pushLength(keyLength)) + 1
      );
    }
    return fallback;
  }

  /** Weight of one output, in weight units: value, script length, script. */
  static outputWeight(script: Uint8Array): number {
    return 4 * (8 + compactSizeLength(script.length) + script.length);
  }

  /**
   * Virtual size of a transaction with these inputs and output scripts, in
   * vbytes, rounded up. Includes the segwit marker and flag.
   */
  static estimateVsize(inputs: SizedInput[], outputScripts: Uint8Array[]): number {
    const overhead =
      4 *
        (4 + // version
          compactSizeLength(inputs.length) +
          compactSizeLength(outputScripts.length) +
          4) + // locktime
      2; // segwit marker and flag
    const weight =
      overhead +
      inputs.reduce((sum, input) => sum + this.inputWeight(input), 0) +
      outputScripts.reduce((sum, script) => sum + this.outputWeight(script), 0);
    return Math.ceil(weight / 4);
  }

  /**
   * Fee for a transaction with these inputs and output scripts at `feeRate`
   * sat/vB, from {@link estimateVsize}.
   */
  static estimateTransactionFee(
    inputs: SizedInput[],
    outputScripts: Uint8Array[],
    feeRate: number,
  ): number {
    return Math.ceil(this.estimateVsize(inputs, outputScripts) * feeRate);
  }

  /**
   * What spending `script` pushes, on its costliest path through OP_IF,
   * OP_NOTIF, OP_ELSE and OP_ENDIF. Signatures and selectors are each the
   * most that any one path needs, so the result is never short. A multisig
   * check needs the count of signatures written in front of its keys, or
   * one per key when that count can't be read.
   */
  private static scriptSpend(script: Uint8Array): ScriptSpend {
    const { opcodes } = bitcoin;
    const chunks = bitcoin.script.decompile(script) ?? [];
    const small = (chunk: number | Uint8Array | undefined) => {
      if (typeof chunk !== "number") return undefined;
      if (chunk === opcodes.OP_0) return 0;
      if (chunk >= opcodes.OP_1 && chunk <= opcodes.OP_16) {
        return chunk - opcodes.OP_1 + 1;
      }
      return undefined;
    };

    type Path = ScriptSpend;
    const most = (a: Path, b: Path): Path => ({
      signatures: Math.max(a.signatures, b.signatures),
      multisigDummy: a.multisigDummy || b.multisigDummy,
      selectors: Math.max(a.selectors, b.selectors),
    });
    // Each open conditional keeps the path before it and the most that its
    // finished branches needed.
    const open: { before: Path; done?: Path }[] = [];
    let path: Path = { signatures: 0, multisigDummy: false, selectors: 0 };

    chunks.forEach((chunk, i) => {
      if (chunk === opcodes.OP_IF || chunk === opcodes.OP_NOTIF) {
        open.push({ before: path });
        path = { ...path, selectors: path.selectors + 1 };
      } else if (chunk === opcodes.OP_ELSE && open.length > 0) {
        const frame = open[open.length - 1];
        frame.done = frame.done ? most(frame.done, path) : path;
        path = { ...frame.before, selectors: frame.before.selectors + 1 };
      } else if (chunk === opcodes.OP_ENDIF && open.length > 0) {
        const frame = open.pop();
        if (frame?.done) path = most(frame.done, path);
      } else if (
        chunk === opcodes.OP_CHECKSIG ||
        chunk === opcodes.OP_CHECKSIGVERIFY
      ) {
        path = { ...path, signatures: path.signatures + 1 };
      } else if (
        chunk === opcodes.OP_CHECKMULTISIG ||
        chunk === opcodes.OP_CHECKMULTISIGVERIFY
      ) {
        const keys = small(chunks[i - 1]) ?? 20;
        const required = small(chunks[i - 2 - keys]);
        path = {
          ...path,
          signatures:
            path.signatures +
            (required !== undefined && required <= keys ? required : keys),
          multisigDummy: true,
        };
      }
    });
    return path;
  }

  /**
   * Estimate transaction fee based on input/output count
   * @deprecated Counts every input as 150 bytes and every output as 34, so
   * it overpays for segwit inputs and undercounts larger outputs such as
   * OP_RETURN. Use {@link estimateTransactionFee}.
   * @param inputCount - Number of inputs
   * @param outputCount - Number of outputs
   * @param feeRate - Fee rate in sat/byte (default 10)
   * @returns Estimated fee in satoshis
   */
  static estimateFee(
    inputCount: number,
    outputCount: number,
    feeRate: number = 10,
  ): number {
    // P2SH input: ~148 bytes (41 outpoint + 1 script length + 23 scriptSig push +
    //   ~83 redeem script push + 4 sequence). Rounded up to 150 as a conservative
    //   overestimate — actual size varies with redeem script length.
    // P2PKH/P2SH output: 34 bytes (8 value + 1 script length + 25 scriptPubKey).
    // Transaction overhead: 10 bytes (4 version + 1 input count + 1 output count + 4 locktime).
    const estimatedSize = inputCount * 150 + outputCount * 34 + 10;
    return Math.ceil(estimatedSize * feeRate);
  }
}
