import type { LockerContext } from "../../core.js";
import { TransactionUtils } from "../../../utils/index.js";

/**
 * Parameters for Dawn staking amount calculation
 * @interface DepositCalculationParams
 * @description Configuration for calculating optimal Dawn staking amounts and fees
 */
export interface DepositCalculationParams {
  /** Array of available inputs with their values (optional - will fetch from address if not provided) */
  inputs?: Array<{ value: number }>;
  /** Source address for automatic UTXO fetching (required if inputs not provided) */
  sourceAddress: string;
  /** Desired amount for escrow output in satoshis */
  desiredEscrowAmount: number;
  /** Desired amount for timelock output in satoshis */
  desiredTimelockAmount: number;
  /** Whether to include change output in calculation */
  includeChange?: boolean;
  /** Optional fee rate in satoshis per byte */
  feeRate?: number;
  /** Optional protocol fee amount in satoshis */
  protocolFeeAmount?: number;
  /** Optional arbitrary string metadata to include in transaction (max 80 bytes) */
  metadata?: string;
}

/**
 * Result of Dawn staking amount calculation
 * @interface DepositCalculationResult
 * @description Calculation results for optimal Dawn staking amounts and feasibility
 */
export interface DepositCalculationResult {
  /** Total input value in satoshis */
  totalInputValue: number;
  /** Estimated transaction fee in satoshis */
  estimatedFee: number;
  /** Total required amount including fees in satoshis */
  totalRequired: number;
  /** Calculated change amount in satoshis */
  changeAmount: number;
  /** Whether the staking is feasible with available inputs */
  feasible: boolean;
  /** Optional recommendation for optimization */
  recommendation?: string;
}

export async function calculateDepositAmounts(
  ctx: LockerContext,
  params: DepositCalculationParams,
): Promise<DepositCalculationResult> {
  const {
    inputs: providedInputs,
    sourceAddress,
    desiredEscrowAmount,
    desiredTimelockAmount,
    includeChange = false,
    feeRate = 10,
    protocolFeeAmount = 0,
    metadata,
  } = params;

  let inputs: Array<{ value: number }>;

  if (providedInputs) {
    if (!Array.isArray(providedInputs)) {
      throw new Error("inputs must be an array when provided");
    }
    inputs = providedInputs;
  } else {
    const apiUtxos = await ctx.api.getAddressUtxos(sourceAddress);
    const availableInputs = apiUtxos.filter((utxo) => utxo.status.confirmed);

    if (availableInputs.length === 0) {
      throw new Error(
        `No confirmed UTXOs available at address ${sourceAddress}`,
      );
    }

    let outputCount = 2;
    if (protocolFeeAmount > 0) outputCount++;
    if (includeChange) outputCount++;
    if (metadata) outputCount++;

    const estimatedInputCount = Math.min(availableInputs.length, 3);
    const estimatedSize =
      10 + estimatedInputCount * 148 + outputCount * 34 + 20;
    const estimatedFee = estimatedSize * feeRate;
    const targetAmount =
      desiredEscrowAmount +
      desiredTimelockAmount +
      protocolFeeAmount +
      estimatedFee;

    try {
      const selectedUtxos = TransactionUtils.selectUtxos(
        availableInputs,
        targetAmount,
      );
      inputs = selectedUtxos.map((utxo) => ({ value: utxo.value }));
    } catch {
      inputs = availableInputs.map((utxo) => ({ value: utxo.value }));
    }
  }

  if (!Number.isInteger(desiredEscrowAmount) || desiredEscrowAmount <= 0) {
    throw new Error("desiredEscrowAmount must be a positive integer");
  }

  if (!Number.isInteger(desiredTimelockAmount) || desiredTimelockAmount <= 0) {
    throw new Error("desiredTimelockAmount must be a positive integer");
  }

  const totalInputValue = inputs.reduce((sum, input) => sum + input.value, 0);

  let outputCount = 2;
  if (protocolFeeAmount > 0) outputCount++;
  if (includeChange) outputCount++;
  if (metadata) outputCount++;

  const estimatedSize = 10 + inputs.length * 148 + outputCount * 34 + 20;
  const estimatedFee = estimatedSize * feeRate;

  const dustThreshold = 546;
  const totalRequired =
    desiredEscrowAmount +
    desiredTimelockAmount +
    protocolFeeAmount +
    estimatedFee;
  const changeAmount = totalInputValue - totalRequired;

  let feasible = true;
  let recommendation = "";

  if (desiredEscrowAmount < dustThreshold) {
    feasible = false;
    recommendation += `Escrow amount ${desiredEscrowAmount} below dust threshold ${dustThreshold}. `;
  }

  if (desiredTimelockAmount < dustThreshold) {
    feasible = false;
    recommendation += `Timelock amount ${desiredTimelockAmount} below dust threshold ${dustThreshold}. `;
  }

  if (protocolFeeAmount > 0 && protocolFeeAmount < dustThreshold) {
    feasible = false;
    recommendation += `Protocol fee amount ${protocolFeeAmount} below dust threshold ${dustThreshold}. `;
  }

  if (changeAmount < 0) {
    feasible = false;
    recommendation += `Insufficient funds: need ${totalRequired}, have ${totalInputValue}, shortage ${Math.abs(changeAmount)}. `;
  }

  if (includeChange && changeAmount > 0 && changeAmount < dustThreshold) {
    feasible = false;
    recommendation += `Change amount ${changeAmount} below dust threshold. `;
  }

  return {
    totalInputValue,
    estimatedFee,
    totalRequired,
    changeAmount: Math.max(0, changeAmount),
    feasible,
    recommendation: recommendation.trim() || undefined,
  };
}
