import * as bitcoin from "bitcoinjs-lib";
import { assertAll } from "../../errors.js";
import { FeeUtils, LocktimeUtils, TransactionUtils } from "../../utils/index.js";
import type { LocktimeTip } from "../../utils/locktime.js";
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
  /**
   * @deprecated Use `chainTip.medianTimePast`. When given, its value in
   * milliseconds, in seconds, stands in for the chain's median time past.
   */
  currentTime?: number;
  /**
   * The chain tip to check the locktime against. Missing values are asked of
   * the locker's API. Pass them to build a transaction ahead of time.
   */
  chainTip?: Partial<LocktimeTip>;
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
    currentTime,
    chainTip,
    previousTransaction = null,
  } = params;

  assertAll([
    [
      !!scriptData && scriptData.type === "time-escrow",
      "Invalid script data - must be a time-escrow script",
    ],
    [
      typeof utxoTxId === "string" && utxoTxId.length === 64,
      "utxoTxId must be a 64-character hex string",
    ],
    [
      Number.isInteger(utxoIndex) && utxoIndex >= 0,
      "utxoIndex must be a non-negative integer",
    ],
    [
      Number.isInteger(amount) && amount > 0,
      "amount must be a positive integer",
    ],
    [typeof outputAddress === "string", "outputAddress must be a string"],
  ]);

  if (spendAfterDeadline && scriptData.locktime) {
    await LocktimeUtils.assertFinal(
      ctx.api,
      [scriptData.locktime],
      "Cannot spend after deadline yet.",
      {
        ...(currentTime !== undefined && {
          medianTimePast: Math.floor(currentTime / 1000),
        }),
        ...chainTip,
      },
    );
  }

  try {
    const psbt = new bitcoin.Psbt({ network: ctx.network });

    if (spendAfterDeadline && scriptData.locktime) {
      psbt.setLocktime(scriptData.locktime);
    }

    const sequence = spendAfterDeadline ? 0xfffffffe : 0xffffffff;
    const witnessScript = Buffer.from(scriptData.redeemScript, "hex");
    const p2wsh = bitcoin.payments.p2wsh({
      redeem: { output: witnessScript, network: ctx.network },
      network: ctx.network,
    });

    if (!p2wsh.output) {
      throw new Error("Failed to derive P2WSH output from redeem script");
    }

    // Fetch the previous transaction to extract the exact UTXO value for witnessUtxo
    let utxoValue = BigInt(amount);
    if (previousTransaction) {
      const prevTx = bitcoin.Transaction.fromBuffer(
        Buffer.from(previousTransaction),
      );
      utxoValue = prevTx.outs[utxoIndex].value;
    } else {
      try {
        const txHex = await ctx.api.getTransaction(utxoTxId);
        const prevTx = bitcoin.Transaction.fromHex(txHex);
        utxoValue = prevTx.outs[utxoIndex].value;
      } catch (error) {
        throw new Error(
          `Failed to fetch previous transaction ${utxoTxId}. P2WSH escrow scripts require the UTXO value for signing. ` +
            `API error: ${(error as Error).message}. Please provide the previous transaction manually using the previousTransaction parameter.`,
        );
      }
    }

    psbt.addInput({
      hash: utxoTxId,
      index: utxoIndex,
      sequence,
      witnessScript,
      witnessUtxo: {
        script: p2wsh.output,
        value: utxoValue,
      },
    });

    const feeRate = await ctx.api.queryChainFeeRates(priority);
    const outputCount = TransactionUtils.countOutputs(1, [params.metadata]);
    const estimatedFee = FeeUtils.estimateFee(1, outputCount, feeRate);
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
