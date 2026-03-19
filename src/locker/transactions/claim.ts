import * as bitcoin from "bitcoinjs-lib";
import { assert } from "../../errors.js";
import { FeeUtils } from "../../utils/index.js";
import { FeePriorities } from "../../utils/fees.js";
import MetadataUtils, { TxType } from "../../utils/metadata.js";
import type { LockerContext } from "../core.js";
import { BaseTransactionParams, ScriptInfo } from "../../index.js";

/**
 * Escrow transaction creation parameters
 * @interface ClaimParams
 * @extends BaseTransactionParams
 * @description Parameters for creating an unsigned escrow spending transaction
 */
export interface ClaimParams extends BaseTransactionParams {
  /** Script data returned from createEscrowScript */
  scriptData: ScriptInfo;
  /** Transaction ID of the UTXO to spend */
  utxoTxId: string;
  /** Output index of the UTXO to spend */
  utxoIndex: number;
  /** Amount in satoshis to spend */
  amount: number;
  /** Address to send funds to */
  outputAddress: string;
  /** Whether to spend after deadline (true) or before (false) */
  spendAfterDeadline: boolean;
  /** Current time for validation (defaults to Date.now()) */
  currentTime?: number;
  /** Previous transaction buffer (for testing/validation) */
  previousTransaction?: Buffer | null;
}

export async function createClaimTransaction(
  ctx: LockerContext,
  params: ClaimParams,
): Promise<string> {
  const {
    scriptData,
    utxoTxId,
    utxoIndex,
    amount,
    outputAddress,
    spendAfterDeadline,
    priority = FeePriorities.MEDIUM,
    currentTime = Date.now(),
    previousTransaction = null,
  } = params;

  assert(
    !!scriptData && scriptData.type === "time-escrow",
    "Invalid script data - must be a time-escrow script",
  );
  assert(
    typeof utxoTxId === "string" && utxoTxId.length === 64,
    "utxoTxId must be a 64-character hex string",
  );
  assert(
    Number.isInteger(utxoIndex) && utxoIndex >= 0,
    "utxoIndex must be a non-negative integer",
  );
  assert(
    Number.isInteger(amount) && amount > 0,
    "amount must be a positive integer",
  );
  assert(typeof outputAddress === "string", "outputAddress must be a string");

  const currentTimeSeconds = Math.floor(currentTime / 1000);
  if (
    spendAfterDeadline &&
    scriptData.locktime &&
    currentTimeSeconds <= scriptData.locktime
  ) {
    throw new Error(
      `Cannot spend after deadline yet. Current time: ${currentTimeSeconds}, Deadline: ${scriptData.locktime}`,
    );
  }

  try {
    const psbt = new bitcoin.Psbt({ network: ctx.network });

    if (spendAfterDeadline && scriptData.locktime) {
      psbt.setLocktime(scriptData.locktime);
    }

    const sequence = spendAfterDeadline ? 0xfffffffe : 0xffffffff;
    const redeemScript = Buffer.from(scriptData.redeemScript, "hex");

    let inputData = {
      hash: utxoTxId,
      index: utxoIndex,
      sequence,
      redeemScript,
      nonWitnessUtxo: Buffer.alloc(0),
    };

    if (previousTransaction) {
      inputData = {
        ...inputData,
        nonWitnessUtxo: Buffer.from(previousTransaction),
      };
    } else {
      try {
        const txHex = await ctx.api.getTransaction(utxoTxId);
        inputData = {
          ...inputData,
          nonWitnessUtxo: Buffer.from(txHex, "hex"),
        };
      } catch (error) {
        throw new Error(
          `Failed to fetch previous transaction ${utxoTxId}. P2SH escrow scripts require the full previous transaction for signing. ` +
            `API error: ${(error as Error).message}. Please provide the previous transaction manually using the previousTransaction parameter.`,
        );
      }
    }

    psbt.addInput(inputData);

    const feeRate = await FeeUtils.queryChainFeeRates(priority);
    const estimatedFee = FeeUtils.estimateFee(1, 1, feeRate);
    const outputAmount = amount - estimatedFee;

    if (outputAmount <= 0) {
      throw new Error("Amount too small to cover fee");
    }

    let outputScript: Buffer;
    try {
      outputScript = Buffer.from(
        bitcoin.address.toOutputScript(outputAddress, ctx.network),
      );
    } catch (error) {
      throw new Error(`Invalid output address: ${(error as Error).message}`);
    }

    psbt.addOutput({
      script: outputScript,
      value: BigInt(outputAmount),
    });

    if (params.metadata) {
      const typedMetadata =
        typeof params.metadata === "string"
          ? params.metadata
          : { ...params.metadata, txType: TxType.Claim };
      psbt.addOutput(MetadataUtils.toOutput(typedMetadata));
    }

    return psbt.toBase64();
  } catch (error) {
    throw new Error(
      `Failed to create spending transaction: ${(error as Error).message}`,
    );
  }
}
