import { FeePriorities } from "@sundial-protocol/btc-provider";

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
   * Estimate transaction fee based on input/output count
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
