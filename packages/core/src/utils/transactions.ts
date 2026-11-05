import * as bitcoin from "bitcoinjs-lib";
import { UTXO } from "../types.js";
import MetadataUtils, { TxType, SundialMetadata } from "./metadata.js";
import { FeeUtils } from "../index.js";
import type { SizedInput } from "./fees.js";

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
   * Output scripts to size a transaction with: one for each address given
   * (falsy entries are skipped), then the metadata output if there is one.
   */
  static outputScripts(
    network: bitcoin.Network,
    addresses: Array<string | false | null | undefined | 0>,
    metadata?: SundialMetadata | string,
  ): Uint8Array[] {
    const scripts = addresses
      .filter((address): address is string => !!address)
      .map((address) => bitcoin.address.toOutputScript(address, network));
    if (metadata) scripts.push(MetadataUtils.toOutput(metadata).script);
    return scripts;
  }

  /**
   * Inputs to size a transaction with: each UTXO's `scriptPubKey`, or
   * `fallbackScript` when it has none. With neither, the input is sized
   * at 150 vB.
   */
  static sizedInputs(
    inputs: UTXO[],
    fallbackScript?: Uint8Array,
  ): SizedInput[] {
    return inputs.map((input) => ({
      scriptPubKey: input.scriptPubKey
        ? Buffer.from(input.scriptPubKey, "hex")
        : (fallbackScript ?? new Uint8Array()),
    }));
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
   * Append a protocol fee output to a PSBT. No-ops when either argument is falsy
   * or the amount is below the dust threshold.
   */
  static appendProtocolFeeOutput(
    psbt: bitcoin.Psbt,
    feeAddress: string | undefined,
    protocolFeeAmount: number | undefined,
  ): void {
    if (feeAddress && protocolFeeAmount && protocolFeeAmount >= FeeUtils.DUST_THRESHOLD) {
      psbt.addOutput({
        address: feeAddress,
        value: BigInt(protocolFeeAmount),
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
