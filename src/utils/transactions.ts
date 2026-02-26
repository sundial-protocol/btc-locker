
import FeeUtils from "./fees";

/**
 * Transaction utilities
 */
export default class TransactionUtils {
  /**
   * Estimate transaction fee for Taproot transactions
   * @param inputs - Number of inputs
   * @param outputs - Number of outputs
   * @param feeRate - Fee rate in sat/vB
   * @returns Estimated fee in satoshis
   */
  static estimateFee(inputs: number, outputs: number, feeRate: number = 10): number {
    // Delegate to FeeUtils for consistent calculation
    return FeeUtils.estimateFee(inputs, outputs, feeRate);
  }

  /**
   * Convert satoshis to BTC
   * @param satoshis - Amount in satoshis
   * @returns Amount in BTC
   */
  static satoshisToBTC(satoshis: number): number {
    return satoshis / 100000000;
  }

  /**
   * Convert BTC to satoshis
   * @param btc - Amount in BTC
   * @returns Amount in satoshis
   */
  static btcToSatoshis(btc: number): number {
    return Math.round(btc * 100000000);
  }
}
