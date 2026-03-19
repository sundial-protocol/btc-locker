import * as bitcoin from "bitcoinjs-lib";
import type {
  BaseTransactionParams,
  ProtocolFeeParams,
  UTXO,
} from "../../../types.js";
import { assert, assertAll } from "../../../errors.js";
import {
  FeeUtils,
  TransactionUtils,
  ValidationUtils,
} from "../../../utils/index.js";
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

  assert(
    !providedInputs ||
      (Array.isArray(providedInputs) && providedInputs.length > 0),
    "inputs must be a non-empty array when provided",
  );
  ValidationUtils.assertProtocolFeeParams(feeAddress, protocolFeeAmount);

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

  assertAll([
    [typeof escrowAddress === "string", "escrowAddress must be a string"],
    [
      Number.isInteger(escrowAmount) && escrowAmount > 0,
      "escrowAmount must be a positive integer",
    ],
    [typeof timelockAddress === "string", "timelockAddress must be a string"],
    [
      Number.isInteger(timelockAmount) && timelockAmount > 0,
      "timelockAmount must be a positive integer",
    ],
  ]);

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

  FeeUtils.assertAboveDust(escrowAmount, "Escrow amount");
  FeeUtils.assertAboveDust(timelockAmount, "Timelock amount");
  if (protocolFeeAmount)
    FeeUtils.assertAboveDust(protocolFeeAmount, "Protocol fee amount");
  if (changeAddress && changeAmount > 0)
    FeeUtils.assertAboveDust(
      changeAmount,
      "Change amount",
      "Either increase inputs or remove change address.",
    );

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
