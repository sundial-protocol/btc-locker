import * as bitcoin from "bitcoinjs-lib";
import { assert } from "../../errors.js";
import { FeeUtils, TransactionUtils } from "../../utils/index.js";
import { FeePriorities } from "../../utils/fees.js";
import { TxType } from "../../utils/metadata.js";
import type { LockerContext } from "../core.js";
import type { BaseTransactionParams, UTXO } from "../../types.js";
import type BitcoinAPI from "../../bitcoin-api.js";

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

  assert(
    !!providedInputs || (!!sourceAddress && !!api),
    "Either inputs or both sourceAddress and api must be provided",
  );

  let inputs: UTXO[] = [];

  if (providedInputs) {
    assert(
      !!sourceAddress || providedInputs.every((u) => !!u.scriptPubKey),
      "When providing explicit inputs, either sourceAddress or a scriptPubKey on each UTXO is required so the correct input script can be set",
    );
    inputs = providedInputs;
  } else if (api && sourceAddress) {
    inputs = await api.fetchConfirmedUtxos(sourceAddress);
  }

  if (inputs.length === 0) {
    throw new Error(`No confirmed UTXOs available at address ${sourceAddress}`);
  }

  const psbt = new bitcoin.Psbt({ network: ctx.network });

  const feeRate = await FeeUtils.queryChainFeeRates(priority);
  const outputCount = TransactionUtils.countOutputs(1, [
    metadata,
    params.changeAddress,
  ]);
  const estimatedFee = FeeUtils.estimateFee(
    inputs.length,
    outputCount,
    feeRate,
  );

  const totalInputValue = inputs.reduce((sum, input) => sum + input.value, 0);
  const changeResult = FeeUtils.calculateChange(
    totalInputValue,
    amount,
    estimatedFee,
  );

  TransactionUtils.addWitnessInputs(
    psbt,
    inputs,
    sourceAddress
      ? bitcoin.address.toOutputScript(sourceAddress, ctx.network)
      : undefined,
  );

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

  TransactionUtils.appendMetadataOutput(psbt, metadata, TxType.Distribution);

  return psbt.toBase64();
}
