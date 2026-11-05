import { FeePriorities } from "@sundial-protocol/btc-provider";
import * as bitcoin from "bitcoinjs-lib";

/** An input to size: the script it spends and, for P2WSH, the witness script. */
export interface SizedInput {
  /** The scriptPubKey of the output being spent. */
  scriptPubKey: Uint8Array;
  /** The witness script, for a P2WSH output. */
  witnessScript?: Uint8Array;
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
   * - P2WSH: from the witness script, with a branch selector when the script
   *   has OP_IF or OP_NOTIF, as `signTransaction` builds it. Without the
   *   witness script, 150 vB.
   * - P2SH, taken as P2SH-P2WPKH: 365 (91.25 vB).
   * - P2PKH: 596 (149 vB).
   * - Anything else: 150 vB.
   */
  static inputWeight(input: SizedInput): number {
    const script = input.scriptPubKey;
    const nonWitness = (scriptSigLength: number) =>
      4 * (SEGWIT_INPUT_BYTES + scriptSigLength);
    const fallback = 4 * 150;

    // OP_0 <20 bytes>
    if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) {
      return (
        nonWitness(0) + 1 + witnessItem(ECDSA_SIGNATURE) + witnessItem(PUBLIC_KEY)
      );
    }
    // OP_1 <32 bytes>
    if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20) {
      return nonWitness(0) + 1 + witnessItem(SCHNORR_SIGNATURE);
    }
    // OP_0 <32 bytes>
    if (script.length === 34 && script[0] === 0x00 && script[1] === 0x20) {
      if (!input.witnessScript) return fallback;
      const items = [
        witnessItem(ECDSA_SIGNATURE),
        ...(this.hasBranch(input.witnessScript) ? [witnessItem(1)] : []),
        witnessItem(input.witnessScript.length),
      ];
      return (
        nonWitness(0) +
        compactSizeLength(items.length) +
        items.reduce((sum, item) => sum + item, 0)
      );
    }
    // OP_HASH160 <20 bytes> OP_EQUAL: the redeem script pushes OP_0 <20 bytes>
    if (script.length === 23 && script[0] === 0xa9 && script[22] === 0x87) {
      return (
        nonWitness(23) + 1 + witnessItem(ECDSA_SIGNATURE) + witnessItem(PUBLIC_KEY)
      );
    }
    // OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
    if (script.length === 25 && script[0] === 0x76 && script[24] === 0xac) {
      return nonWitness(witnessItem(ECDSA_SIGNATURE) + witnessItem(PUBLIC_KEY));
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

  /** Whether a witness script has OP_IF or OP_NOTIF, so its witness carries a branch selector. */
  private static hasBranch(witnessScript: Uint8Array): boolean {
    const chunks = bitcoin.script.decompile(witnessScript) ?? [];
    return chunks.some(
      (chunk) =>
        chunk === bitcoin.opcodes.OP_IF || chunk === bitcoin.opcodes.OP_NOTIF,
    );
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
