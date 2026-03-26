import BitcoinAPI, { type ApiProvider } from "../bitcoin-api.js";
import { type NetworkType, NETWORKS } from "./network.js";

/**
 * Fee priority levels for user-friendly fee selection
 */
export enum FeePriorities {
  /** Fast confirmation (next block) */
  HIGH = "high",
  /** Medium confirmation (~6 blocks) */
  MEDIUM = "medium",
  /** Slow confirmation (~1 day) */
  LOW = "low",
}

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

  /**
   * Query the blockchain for current fee rates
   * @param network - Network to query (default: bitcoin mainnet)
   * @param apiProvider - API provider to use (default: mempool)
   * @returns Fee priorities with sat/byte rates for different confirmation times
   */
  static async queryChainFeeRates(
    priority: FeePriorities = FeePriorities.MEDIUM,
    network: NetworkType = NETWORKS.bitcoin,
    apiProvider: ApiProvider = "mempool",
  ): Promise<number> {
    try {
      const api = new BitcoinAPI(network, apiProvider);
      const feeEstimates = await api.getFeeEstimates();

      // Convert raw fee estimates to user-friendly priorities
      const result = {
        high: 0,
        medium: 0,
        low: 0,
      };

      // Map common block targets to priorities
      // Look for closest matches to standard confirmation targets
      const blockTargets = Object.keys(feeEstimates)
        .map(Number)
        .sort((a, b) => a - b);

      // High priority: 1-2 blocks (next block confirmation)
      result.high =
        feeEstimates[1] || feeEstimates[2] || blockTargets[0]
          ? feeEstimates[blockTargets[0]]
          : 20;

      // Medium priority: 3-6 blocks
      const mediumTarget = blockTargets.find(
        (target) => target >= 3 && target <= 6,
      );
      result.medium = mediumTarget
        ? feeEstimates[mediumTarget]
        : feeEstimates[6] || result.high * 0.7;

      // Low priority: 12+ blocks (lower cost)
      const lowTarget = blockTargets.find((target) => target >= 12);
      result.low = lowTarget
        ? feeEstimates[lowTarget]
        : feeEstimates[144] || result.medium * 0.5;

      // Ensure fees are reasonable (min 1 sat/byte, max 1000 sat/byte)
      result.high = Math.min(Math.max(Math.ceil(result.high), 1), 1000);
      result.medium = Math.min(Math.max(Math.ceil(result.medium), 1), 1000);
      result.low = Math.min(Math.max(Math.ceil(result.low), 1), 1000);

      switch (priority) {
        case FeePriorities.HIGH:
          return result.high;
        case FeePriorities.MEDIUM:
          return result.medium;
        case FeePriorities.LOW:
          return result.low;
        default:
          return result.medium;
      }
    } catch (error) {
      throw new Error(`Failed to query fee rates: ${(error as Error).message}`);
    }
  }
}
