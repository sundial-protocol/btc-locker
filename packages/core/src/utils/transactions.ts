import * as bitcoin from "bitcoinjs-lib";
import { UTXO } from "../types.js";
import MetadataUtils, { TxType, SundialMetadata } from "./metadata.js";

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
    const sortedUtxos = [...availableUtxos]
      .filter((utxo) => !utxo.doNotSpend)
      .sort((a, b) => b.value - a.value);

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
        `Insufficient funds in available UTXOs. Need: ${targetAmount}, Available: ${totalValue}, Shortage: ${
          targetAmount - totalValue
        }`,
      );
    }

    return selectedUtxos;
  }

  /**
   * Count transaction outputs: start from `base` and add 1 for each truthy extra.
   * @example TransactionUtils.countOutputs(2, [protocolFeeAmount && feeAddress, changeAddress, metadata])
   */
  static countOutputs(base: number, extras: unknown[]): number {
    return base + extras.filter(Boolean).length;
  }

  /**
   * Add segwit (P2WPKH / P2WSH) inputs to a PSBT.
   * `input.scriptPubKey` takes precedence over `fallbackScript`.
   * Throws if neither is available.
   */
  static addWitnessInputs(
    psbt: bitcoin.Psbt,
    inputs: UTXO[],
    fallbackScript: Buffer | Uint8Array | undefined,
  ): void {
    const fallback =
      fallbackScript != null ? Buffer.from(fallbackScript) : undefined;
    for (const input of inputs) {
      const script = input.scriptPubKey
        ? Buffer.from(input.scriptPubKey, "hex")
        : fallback;
      if (!script) {
        throw new Error(
          "witnessUtxo script is required: provide either sourceAddress in params or scriptPubKey on each UTXO",
        );
      }
      psbt.addInput({
        hash: input.txid,
        index: input.vout,
        witnessUtxo: { script, value: BigInt(input.value) },
      });
    }
  }

  /**
   * Append an OP_RETURN metadata output to a PSBT. No-ops when `metadata` is falsy.
   * When `txType` is supplied and `metadata` is an object, the txType field is stamped.
   */
  static appendMetadataOutput(
    psbt: bitcoin.Psbt,
    metadata: SundialMetadata | string | undefined,
    txType?: TxType,
  ): void {
    if (!metadata) return;
    const stamped =
      typeof metadata === "string" || txType === undefined
        ? metadata
        : { ...metadata, txType };
    psbt.addOutput(MetadataUtils.toOutput(stamped));
  }
}
