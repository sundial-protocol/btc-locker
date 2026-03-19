import * as bitcoin from "bitcoinjs-lib";
import type {
  BaseTransactionParams,
  ProtocolFeeParams,
  UTXO,
} from "../../../types.js";
import { FeeUtils, TransactionUtils } from "../../../utils/index.js";
import { FeePriorities } from "../../../utils/fees.js";
import { TxType } from "../../../utils/metadata.js";
import type { LockerContext } from "../../core.js";

/**
 * Parameters for Dawn staking transactions
 * @interface DepositParams
 * @extends BaseTransactionParams
 * @extends ProtocolFeeParams
 * @description Configuration for creating Dawn protocol staking transactions with dual outputs
 */
export interface DepositParams
  extends BaseTransactionParams, ProtocolFeeParams {
  /** Array of unspent transaction outputs to deposit (optional - will auto-select from address if not provided) */
  inputs?: UTXO[];
  /** Source address for automatic UTXO selection (required if inputs not provided) */
  sourceAddress: string;
  /** Escrow script address */
  escrowAddress: string;
  /** Amount to send to escrow in satoshis */
  escrowAmount: number;
  /** Timelock script address */
  timelockAddress: string;
  /** Amount to send to timelock in satoshis */
  timelockAmount: number;
}

export async function createDepositTransaction(
  ctx: LockerContext,
  params: DepositParams,
): Promise<string> {
  const {
    inputs: providedInputs,
    sourceAddress,
    escrowAddress,
    escrowAmount,
    timelockAddress,
    timelockAmount,
    changeAddress,
    priority = FeePriorities.MEDIUM,
    feeAddress,
    protocolFeeAmount,
    metadata,
  } = params;

  if (
    providedInputs &&
    (!Array.isArray(providedInputs) || providedInputs.length === 0)
  ) {
    throw new Error("inputs must be a non-empty array when provided");
  }

  if (feeAddress && !protocolFeeAmount) {
    throw new Error(
      "protocolFeeAmount is required when feeAddress is provided",
    );
  }

  if (protocolFeeAmount && !feeAddress) {
    throw new Error(
      "feeAddress is required when protocolFeeAmount is provided",
    );
  }

  let inputs: UTXO[];
  const feeRate = await FeeUtils.queryChainFeeRates(priority);

  if (providedInputs) {
    inputs = providedInputs;
  } else {
    const availableInputs = await ctx.api.fetchConfirmedUtxos(sourceAddress);

    if (availableInputs.length === 0) {
      throw new Error(
        `No confirmed UTXOs available at address ${sourceAddress}`,
      );
    }

    const outputCount = TransactionUtils.countOutputs(2, [
      protocolFeeAmount && feeAddress,
      changeAddress,
      metadata,
    ]);

    const estimatedInputCount = Math.min(availableInputs.length, 3);
    const estimatedFee = FeeUtils.estimateFee(
      estimatedInputCount,
      outputCount,
      feeRate,
    );
    const targetAmount =
      escrowAmount + timelockAmount + (protocolFeeAmount || 0) + estimatedFee;

    inputs = TransactionUtils.selectUtxos(availableInputs, targetAmount);
  }

  if (typeof escrowAddress !== "string") {
    throw new Error("escrowAddress must be a string");
  }

  if (!Number.isInteger(escrowAmount) || escrowAmount <= 0) {
    throw new Error("escrowAmount must be a positive integer");
  }

  if (typeof timelockAddress !== "string") {
    throw new Error("timelockAddress must be a string");
  }

  if (!Number.isInteger(timelockAmount) || timelockAmount <= 0) {
    throw new Error("timelockAmount must be a positive integer");
  }

  const totalInputValue = inputs.reduce((sum, input) => {
    if (!Number.isInteger(input.value) || input.value <= 0) {
      throw new Error("All input values must be positive integers");
    }
    return sum + input.value;
  }, 0);

  const outputCount = TransactionUtils.countOutputs(2, [
    protocolFeeAmount && feeAddress,
    changeAddress,
    metadata,
  ]);
  const estimatedFee = FeeUtils.estimateFee(
    inputs.length,
    outputCount,
    feeRate,
  );

  const totalRequiredAmount =
    escrowAmount + timelockAmount + (protocolFeeAmount || 0) + estimatedFee;
  const changeAmount = totalInputValue - totalRequiredAmount;

  if (changeAmount < 0) {
    throw new Error(
      `Insufficient funds. Total: ${totalInputValue}, Required: ${totalRequiredAmount} (Escrow: ${escrowAmount}, Timelock: ${timelockAmount}${protocolFeeAmount ? `, Protocol Fee: ${protocolFeeAmount}` : ""}, Network Fee: ${estimatedFee}), Shortage: ${Math.abs(changeAmount)}`,
    );
  }

  if (escrowAmount < FeeUtils.DUST_THRESHOLD) {
    throw new Error(
      `Escrow amount ${escrowAmount} is below dust threshold ${FeeUtils.DUST_THRESHOLD}`,
    );
  }

  if (timelockAmount < FeeUtils.DUST_THRESHOLD) {
    throw new Error(
      `Timelock amount ${timelockAmount} is below dust threshold ${FeeUtils.DUST_THRESHOLD}`,
    );
  }

  if (protocolFeeAmount && protocolFeeAmount < FeeUtils.DUST_THRESHOLD) {
    throw new Error(
      `Protocol fee amount ${protocolFeeAmount} is below dust threshold ${FeeUtils.DUST_THRESHOLD}`,
    );
  }

  if (
    changeAddress &&
    changeAmount > 0 &&
    changeAmount < FeeUtils.DUST_THRESHOLD
  ) {
    throw new Error(
      `Change amount ${changeAmount} is below dust threshold ${FeeUtils.DUST_THRESHOLD}. Either increase inputs or remove change address.`,
    );
  }

  try {
    const psbt = new bitcoin.Psbt({ network: ctx.network });
    TransactionUtils.addWitnessInputs(
      psbt,
      inputs,
      bitcoin.address.toOutputScript(sourceAddress, ctx.network),
    );

    psbt.addOutput({
      address: escrowAddress,
      value: BigInt(escrowAmount),
    });

    psbt.addOutput({
      address: timelockAddress,
      value: BigInt(timelockAmount),
    });

    if (
      feeAddress &&
      protocolFeeAmount &&
      protocolFeeAmount >= FeeUtils.DUST_THRESHOLD
    ) {
      psbt.addOutput({
        address: feeAddress,
        value: BigInt(protocolFeeAmount),
      });
    }

    if (changeAddress && changeAmount >= FeeUtils.DUST_THRESHOLD) {
      psbt.addOutput({
        address: changeAddress,
        value: BigInt(changeAmount),
      });
    }

    TransactionUtils.appendMetadataOutput(psbt, metadata, TxType.Deposit);

    return psbt.toBase64();
  } catch (error) {
    throw new Error(
      `Failed to create Dawn staking transaction: ${(error as Error).message}`,
    );
  }
}
