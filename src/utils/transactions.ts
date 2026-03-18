import { UTXO } from "../types.js";

/**
 * Transaction utilities
 */
export default class TransactionUtils {
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

  /**
   * Select optimal UTXOs for a given target amount using a greedy algorithm.
   * Picks largest UTXOs first until the target is covered.
   */
  static selectUtxos(availableUtxos: UTXO[], targetAmount: number): UTXO[] {
    const sortedUtxos = [...availableUtxos].sort((a, b) => b.value - a.value);

    const selectedUtxos: UTXO[] = [];
    let totalValue = 0;

    for (const utxo of sortedUtxos) {
      selectedUtxos.push(utxo);
      totalValue += utxo.value;

      if (totalValue >= targetAmount) {
        break;
      }
    }

    if (totalValue < targetAmount) {
      throw new Error(
        `Insufficient funds in available UTXOs. Need: ${targetAmount}, Available: ${totalValue}, Shortage: ${targetAmount - totalValue}`,
      );
    }

    return selectedUtxos;
  }
}
