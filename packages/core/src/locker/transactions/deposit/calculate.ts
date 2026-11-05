import type { LockerContext } from "../../core.js";
import { assertAll } from "../../../errors.js";
import * as bitcoin from "bitcoinjs-lib";
import { FeeUtils, TransactionUtils } from "../../../utils/index.js";

/** A P2WSH output script's length: the escrow and timelock are P2WSH. */
const P2WSH_SCRIPT = new Uint8Array(34);

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
  // The escrow and timelock addresses are not known here, but both are
  // P2WSH. The protocol fee address is not known either, so it is sized as
  // P2WSH, the larger case. Change goes back to the source address.
  const sourceScript = bitcoin.address.toOutputScript(sourceAddress, ctx.network);
  const outputScripts = [
    P2WSH_SCRIPT,
    P2WSH_SCRIPT,
    ...(protocolFeeAmount > 0 ? [P2WSH_SCRIPT] : []),
    ...(includeChange ? [sourceScript] : []),
    ...TransactionUtils.outputScripts(ctx.network, [], metadata),
  ];
  const feeFor = (inputCount: number) =>
    FeeUtils.estimateTransactionFee(
      Array.from({ length: inputCount }, () => ({ scriptPubKey: sourceScript })),
      outputScripts,
      feeRate,
    );
  const minimumCost =
    desiredEscrowAmount + desiredTimelockAmount + protocolFeeAmount;

  if (providedInputs) {
    assertAll([
      [Array.isArray(providedInputs), "inputs must be an array when provided"],
    ]);
    inputs = providedInputs;
  } else {
    const availableInputs = await ctx.api.fetchConfirmedUtxos(sourceAddress);

    if (availableInputs.length === 0) {
      throw new Error(
        `No confirmed UTXOs available at address ${sourceAddress}`,
      );
    }

    const approxFee = feeFor(Math.min(availableInputs.length, 3));
    try {
      inputs = TransactionUtils.selectUtxos(
        availableInputs,
        minimumCost + approxFee,
      ).map((utxo) => ({ value: utxo.value }));
    } catch {
      inputs = availableInputs.map((utxo) => ({ value: utxo.value }));
    }
  }

  assertAll([
    [
      Number.isInteger(desiredEscrowAmount) && desiredEscrowAmount > 0,
      "desiredEscrowAmount must be a positive integer",
    ],
    [
      Number.isInteger(desiredTimelockAmount) && desiredTimelockAmount > 0,
      "desiredTimelockAmount must be a positive integer",
    ],
  ]);

  const totalInputValue = inputs.reduce((sum, input) => sum + input.value, 0);

  const estimatedFee = feeFor(inputs.length);

  const totalRequired = minimumCost + estimatedFee;
  const changeAmount = totalInputValue - totalRequired;

  const checks: [boolean, string][] = [
    [
      desiredEscrowAmount < FeeUtils.DUST_THRESHOLD,
      `Escrow amount ${desiredEscrowAmount} below dust threshold ${FeeUtils.DUST_THRESHOLD}. `,
    ],
    [
      desiredTimelockAmount < FeeUtils.DUST_THRESHOLD,
      `Timelock amount ${desiredTimelockAmount} below dust threshold ${FeeUtils.DUST_THRESHOLD}. `,
    ],
    [
      protocolFeeAmount > 0 && protocolFeeAmount < FeeUtils.DUST_THRESHOLD,
      `Protocol fee amount ${protocolFeeAmount} below dust threshold ${FeeUtils.DUST_THRESHOLD}. `,
    ],
    [
      changeAmount < 0,
      `Insufficient funds: need ${totalRequired}, have ${totalInputValue}, shortage ${Math.abs(changeAmount)}. `,
    ],
    [
      includeChange &&
        changeAmount > 0 &&
        changeAmount < FeeUtils.DUST_THRESHOLD,
      `Change amount ${changeAmount} below dust threshold. `,
    ],
  ];

  const recommendation = checks
    .filter(([cond]) => cond)
    .map(([, msg]) => msg)
    .join("")
    .trim();
  const feasible = recommendation === "";

  return {
    totalInputValue,
    estimatedFee,
    totalRequired,
    changeAmount: Math.max(0, changeAmount),
    feasible,
    recommendation: recommendation || undefined,
  };
}
