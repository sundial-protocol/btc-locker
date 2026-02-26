
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
   * Calculate change amount and determine if it's above dust threshold
   * @param totalInputValue - Total value of inputs
   * @param outputValue - Value to send
   * @param feeAmount - Transaction fee
   * @returns Change calculation result
   */
  static calculateChange(totalInputValue: number, outputValue: number, feeAmount: number = this.DEFAULT_FEE): {
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
      adjustedFee
    };
  }

  /**
   * Estimate transaction fee based on input/output count for Taproot transactions
   * @param inputCount - Number of inputs
   * @param outputCount - Number of outputs
   * @param feeRate - Fee rate in sat/vbyte (default 10)
   * @param scriptOverhead - Additional overhead for script-path spending (default 0)
   * @returns Estimated fee in satoshis
   */
  static estimateFee(inputCount: number, outputCount: number, feeRate: number = 10, scriptOverhead: number = 0): number {
    // P2TR estimates: 68 vbytes per input (key-path spend), 43 vbytes per output, 11 vbytes overhead
    const estimatedSize = (inputCount * 68) + (outputCount * 43) + 11 + scriptOverhead;
    return Math.ceil(estimatedSize * feeRate);
  }

  /**
   * Estimate transaction size in vbytes for Taproot transactions
   * @param inputCount - Number of inputs
   * @param outputCount - Number of outputs  
   * @param scriptOverhead - Additional overhead for script-path spending (default 0)
   * @returns Estimated transaction size in vbytes
   */
  static estimateSize(inputCount: number, outputCount: number, scriptOverhead: number = 0): number {
    // P2TR estimates: 68 vbytes per input (key-path spend), 43 vbytes per output, 11 vbytes overhead
    return (inputCount * 68) + (outputCount * 43) + 11 + scriptOverhead;
  }
}