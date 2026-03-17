import * as bitcoin from "bitcoinjs-lib";
import type {
  BaseTransactionParams,
  ProtocolFeeParams,
  TransactionResult,
  UTXO,
} from "../../../types.js";
import { FeeUtils, TransactionUtils } from "../../../utils/index.js";
import { FeePriorities } from "../../../utils/fees.js";
import MetadataUtils, { TxType } from "../../../utils/metadata.js";
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

/**
 * Result of Dawn staking transaction
 * @interface DepositResult
 * @extends TransactionResult
 * @description Transaction result with detailed output breakdown for Dawn staking
 */
export interface DepositResult extends TransactionResult {
  /** Output breakdown */
  outputs: {
    /** Amount sent to escrow in satoshis */
    escrowAmount: number;
    /** Amount sent to timelock in satoshis */
    timelockAmount: number;
    /** Optional protocol fee amount in satoshis */
    protocolFeeAmount?: number;
    /** Optional change amount in satoshis */
    changeAmount?: number;
  };
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
    const apiUtxos = await ctx.api.getAddressUtxos(sourceAddress);
    const availableInputs = apiUtxos.filter((utxo) => utxo.status.confirmed);

    if (availableInputs.length === 0) {
      throw new Error(
        `No confirmed UTXOs available at address ${sourceAddress}`,
      );
    }

    let outputCount = 2;
    if (protocolFeeAmount && feeAddress) outputCount++;
    if (changeAddress) outputCount++;
    if (metadata) outputCount++;

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

  let outputCount = 2;
  if (protocolFeeAmount && feeAddress) outputCount++;
  if (changeAddress) outputCount++;
  if (metadata) outputCount++;

  const estimatedSize = 10 + inputs.length * 148 + outputCount * 34 + 20;
  const estimatedFee = estimatedSize * feeRate;

  const totalRequiredAmount =
    escrowAmount + timelockAmount + (protocolFeeAmount || 0) + estimatedFee;
  const changeAmount = totalInputValue - totalRequiredAmount;

  if (changeAmount < 0) {
    throw new Error(
      `Insufficient funds. Total: ${totalInputValue}, Required: ${totalRequiredAmount} (Escrow: ${escrowAmount}, Timelock: ${timelockAmount}${protocolFeeAmount ? `, Protocol Fee: ${protocolFeeAmount}` : ""}, Network Fee: ${estimatedFee}), Shortage: ${Math.abs(changeAmount)}`,
    );
  }

  const dustThreshold = 546;

  if (escrowAmount < dustThreshold) {
    throw new Error(
      `Escrow amount ${escrowAmount} is below dust threshold ${dustThreshold}`,
    );
  }

  if (timelockAmount < dustThreshold) {
    throw new Error(
      `Timelock amount ${timelockAmount} is below dust threshold ${dustThreshold}`,
    );
  }

  if (protocolFeeAmount && protocolFeeAmount < dustThreshold) {
    throw new Error(
      `Protocol fee amount ${protocolFeeAmount} is below dust threshold ${dustThreshold}`,
    );
  }

  if (changeAddress && changeAmount > 0 && changeAmount < dustThreshold) {
    throw new Error(
      `Change amount ${changeAmount} is below dust threshold ${dustThreshold}. Either increase inputs or remove change address.`,
    );
  }

  try {
    const psbt = new bitcoin.Psbt({ network: ctx.network });
    const inputScript = bitcoin.address.toOutputScript(sourceAddress, ctx.network);

    for (const input of inputs) {
      psbt.addInput({
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: input.scriptPubKey
            ? Buffer.from(input.scriptPubKey, "hex")
            : inputScript,
          value: BigInt(input.value),
        },
      });
    }

    psbt.addOutput({
      address: escrowAddress,
      value: BigInt(escrowAmount),
    });

    psbt.addOutput({
      address: timelockAddress,
      value: BigInt(timelockAmount),
    });

    if (feeAddress && protocolFeeAmount && protocolFeeAmount >= dustThreshold) {
      psbt.addOutput({
        address: feeAddress,
        value: BigInt(protocolFeeAmount),
      });
    }

    if (changeAddress && changeAmount >= dustThreshold) {
      psbt.addOutput({
        address: changeAddress,
        value: BigInt(changeAmount),
      });
    }

    if (metadata) {
      const typedMetadata =
        typeof metadata === "string"
          ? metadata
          : { ...metadata, txType: TxType.Deposit };
      psbt.addOutput(MetadataUtils.toOutput(typedMetadata));
    }

    return psbt.toBase64();
  } catch (error) {
    throw new Error(
      `Failed to create Dawn staking transaction: ${(error as Error).message}`,
    );
  }
}
