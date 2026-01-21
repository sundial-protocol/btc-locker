
/**
 * Transaction utilities
 */
export default class TransactionUtils {
  /**
   * Estimate transaction fee
   * @param inputs - Number of inputs
   * @param outputs - Number of outputs
   * @param feeRate - Fee rate in sat/vB
   * @returns Estimated fee in satoshis
   */
  static estimateFee(inputs: number, outputs: number, feeRate: number = 10): number {
    // Rough estimation: P2SH input ~147 vB, P2PKH output ~34 vB, overhead ~10 vB
    const estimatedSize = inputs * 147 + outputs * 34 + 10;
    return Math.ceil(estimatedSize * feeRate);
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
