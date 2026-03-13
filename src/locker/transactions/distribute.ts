import * as bitcoin from "bitcoinjs-lib";
import { FeeUtils } from "../../utils";
import { FeePriorities } from "../../utils/fees";
import MetadataUtils, { TxType } from "../../utils/metadata";
import type { LockerContext } from "../core";
import {
  BaseTransactionParams,
  TransactionResult,
  BitcoinAPI,
  UTXO,
} from "../..";

/**
 * Parameters for yield distribution
 * @interface DistributionParams
 * @extends BaseTransactionParams
 * @description Configuration for distributing yield from time-locked Bitcoin funds
 */
export interface DistributionParams extends BaseTransactionParams {
  /** Array of unspent transaction outputs from timelock (optional - will fetch from address if not provided) */
  inputs?: UTXO[];
  /** Source address for automatic UTXO selection (required if inputs not provided) */
  sourceAddress?: string;
  /** Bitcoin API instance for fetching UTXOs (required if inputs not provided) */
  api?: BitcoinAPI;
  /** Address of the timelock script */
  timelockAddress: string;
  /** Amount to distribute in satoshis */
  amount: number;
  /** Optional change address for remaining funds */
  changeAddress?: string;
}

/**
 * Result of yield distribution
 * @interface DistributionResult
 * @extends TransactionResult
 * @description Transaction result with additional yield distribution metadata
 */
export interface DistributionResult extends TransactionResult {
  /** Bitcoin transaction object */
  transaction: bitcoin.Transaction;
  /** Distribution details */
  distribution: {
    /** Amount distributed in satoshis */
    amount: number;
    /** Destination address for the distribution */
    destination: string;
    /** Change amount in satoshis */
    change: number;
  };
}

export async function createDistributionTransaction(
  ctx: LockerContext,
  params: DistributionParams,
): Promise<string> {
  const {
    inputs: providedInputs,
    sourceAddress,
    api,
    timelockAddress,
    amount,
    metadata,
    priority = FeePriorities.MEDIUM,
  } = params;

  if (!providedInputs && (!sourceAddress || !api)) {
    throw new Error(
      "Either inputs or both sourceAddress and api must be provided",
    );
  }

  let inputs: UTXO[] = [];

  if (providedInputs) {
    inputs = providedInputs;
  } else if (api && sourceAddress) {
    const apiUtxos = await api.getAddressUtxos(sourceAddress);
    inputs = apiUtxos.filter((utxo) => utxo.status.confirmed);
  }

  if (inputs.length === 0) {
    throw new Error(`No confirmed UTXOs available at address ${sourceAddress}`);
  }

  const psbt = new bitcoin.Psbt({ network: ctx.network });

  const feeRate = await FeeUtils.queryChainFeeRates(priority);
  const outputCount = () => {
    let count = 1;
    if (metadata) count += 1;
    if (params.changeAddress) count += 1;
    return count;
  };

  const estimatedFee = FeeUtils.estimateFee(
    inputs.length,
    outputCount(),
    feeRate,
  );

  const totalInputValue = inputs.reduce((sum, input) => sum + input.value, 0);
  const changeResult = FeeUtils.calculateChange(
    totalInputValue,
    amount,
    estimatedFee,
  );

  for (const input of inputs) {
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.alloc(0),
        value: BigInt(input.value),
      },
    });
  }

  psbt.addOutput({
    address: timelockAddress,
    value: BigInt(amount),
  });

  if (changeResult.isAboveDustThreshold) {
    psbt.addOutput({
      address: params.changeAddress || timelockAddress,
      value: BigInt(changeResult.changeAmount),
    });
  }

  if (metadata) {
    const typedMetadata =
      typeof metadata === "string"
        ? metadata
        : { ...metadata, txType: TxType.Distribution };
    psbt.addOutput(MetadataUtils.toOutput(typedMetadata));
  }

  return psbt.toBase64();
}
