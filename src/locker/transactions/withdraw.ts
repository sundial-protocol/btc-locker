import * as bitcoin from "bitcoinjs-lib";
import type {
  BaseTransactionParams,
  ProtocolFeeParams,
  UTXO,
} from "../../types.js";
import { FeeUtils, ScriptUtils, TransactionUtils } from "../../utils/index.js";
import { FeePriorities } from "../../utils/fees.js";
import { TxType } from "../../utils/metadata.js";
import type { LockerContext } from "../core.js";

/**
 * Parameters for Dawn withdrawal
 * @interface WithdrawalParams
 * @extends BaseTransactionParams
 * @extends ProtocolFeeParams
 * @description Configuration for withdrawing from both escrow and timelock Dawn staking outputs
 */
export interface WithdrawalParams
  extends BaseTransactionParams, ProtocolFeeParams {
  /** Array of escrow inputs to withdraw from (optional - will fetch all UTXOs from escrow address if not provided) */
  escrowInputs?: UTXO[];
  /** Escrow script address (optional - will be calculated from escrowRedeemScript if not provided) */
  escrowAddress?: string;
  /** Escrow redeem script in hexadecimal format */
  escrowRedeemScript: string;
  /** Array of timelock inputs to withdraw from (optional - will fetch all UTXOs from timelock address if not provided) */
  timelockInputs?: UTXO[];
  /** Timelock script address (optional - will be calculated from timelockRedeemScript if not provided) */
  timelockAddress?: string;
  /** Timelock redeem script in hexadecimal format */
  timelockRedeemScript: string;
  /** Destination address for withdrawn funds */
  destination: string;
}

export async function createWithdrawalTransaction(
  ctx: LockerContext,
  params: WithdrawalParams,
): Promise<string> {
  const {
    escrowInputs: providedEscrowInputs,
    escrowAddress: providedEscrowAddress,
    escrowRedeemScript,
    timelockInputs: providedTimelockInputs,
    timelockAddress: providedTimelockAddress,
    timelockRedeemScript,
    destination,
    priority = FeePriorities.MEDIUM,
    feeAddress,
    protocolFeeAmount,
    metadata,
  } = params;

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

  const escrowAddress =
    providedEscrowAddress ??
    ScriptUtils.createScriptAddress(
      Buffer.from(escrowRedeemScript, "hex"),
      ctx.network,
    );
  const timelockAddress =
    providedTimelockAddress ??
    ScriptUtils.createScriptAddress(
      Buffer.from(timelockRedeemScript, "hex"),
      ctx.network,
    );

  let escrowInputs: UTXO[] = providedEscrowInputs || [];
  let timelockInputs: UTXO[] = providedTimelockInputs || [];

  if (!providedEscrowInputs) {
    try {
      escrowInputs = await ctx.api.fetchConfirmedUtxos(escrowAddress);
    } catch (error) {
      throw new Error(
        `Failed to fetch escrow UTXOs from ${escrowAddress}: ${(error as Error).message}`,
      );
    }
  }

  if (!providedTimelockInputs) {
    try {
      timelockInputs = await ctx.api.fetchConfirmedUtxos(timelockAddress);
    } catch (error) {
      throw new Error(
        `Failed to fetch timelock UTXOs from ${timelockAddress}: ${(error as Error).message}`,
      );
    }
  }

  if (escrowInputs.length === 0 && timelockInputs.length === 0) {
    throw new Error(
      "No confirmed UTXOs available for withdrawal from either escrow or timelock addresses",
    );
  }

  const escrowValue = escrowInputs.reduce((sum, input) => sum + input.value, 0);
  const timelockValue = timelockInputs.reduce(
    (sum, input) => sum + input.value,
    0,
  );
  const totalInputValue = escrowValue + timelockValue;
  const feeRate = await FeeUtils.queryChainFeeRates(priority);
  const feeAmount = FeeUtils.estimateFee(
    escrowInputs.length + timelockInputs.length,
    1 + (protocolFeeAmount ? 1 : 0),
    feeRate,
  );
  const totalFees = feeAmount + (protocolFeeAmount || 0);
  const destinationValue = totalInputValue - totalFees;

  if (destinationValue <= FeeUtils.DUST_THRESHOLD) {
    throw new Error(
      "Destination output amount would be below dust threshold after fees",
    );
  }

  if (protocolFeeAmount && protocolFeeAmount < FeeUtils.DUST_THRESHOLD) {
    throw new Error(
      `Protocol fee amount ${protocolFeeAmount} is below dust threshold ${FeeUtils.DUST_THRESHOLD}`,
    );
  }

  const psbt = new bitcoin.Psbt({ network: ctx.network });

  let maxLocktime = 0;
  const currentTime = Math.floor(Date.now() / 1000);

  try {
    const script = Buffer.from(escrowRedeemScript, "hex");
    if (script.length > 5 && script[0] === 0x63) {
      const timestampBytes = script.slice(2, 6);
      const timestamp = timestampBytes.readUInt32LE(0);

      if (currentTime < timestamp) {
        throw new Error(
          `Cannot withdraw from escrow script yet. Current time: ${currentTime}, Deadline: ${timestamp}. Wait until ${new Date(timestamp * 1000).toISOString()}`,
        );
      }

      maxLocktime = Math.max(maxLocktime, timestamp);
    }
  } catch (parseError) {
    if (
      parseError instanceof Error &&
      parseError.message.includes("Cannot withdraw")
    ) {
      throw parseError;
    }
  }

  try {
    const script = Buffer.from(timelockRedeemScript, "hex");
    if (script.length > 4 && script[0] === 0x04) {
      const timestampBytes = script.slice(1, 5);
      const timestamp = timestampBytes.readUInt32LE(0);

      if (currentTime < timestamp) {
        throw new Error(
          `Cannot withdraw from timelock script yet. Current time: ${currentTime}, Deadline: ${timestamp}. Wait until ${new Date(timestamp * 1000).toISOString()}`,
        );
      }

      maxLocktime = Math.max(maxLocktime, timestamp);
    }
  } catch (parseError) {
    if (
      parseError instanceof Error &&
      parseError.message.includes("Cannot withdraw")
    ) {
      throw parseError;
    }
  }

  if (maxLocktime > 0) {
    psbt.setLocktime(maxLocktime);
  }

  // Helper to add script inputs (escrow or timelock)
  const addScriptInputs = async (inputs: UTXO[], redeemScriptHex: string) => {
    const redeemScript = Buffer.from(redeemScriptHex, "hex");
    for (const input of inputs) {
      let inputData;
      if (ctx.api) {
        try {
          const txHex = await ctx.api.getTransaction(input.txid);
          inputData = {
            hash: input.txid,
            index: input.vout,
            nonWitnessUtxo: Buffer.from(txHex, "hex"),
            redeemScript,
            sequence: 0xfffffffe,
          };
        } catch (error) {
          throw new Error(
            `Failed to fetch transaction ${input.txid}: ${(error as Error).message}`,
          );
        }
      } else {
        const scriptHash = bitcoin.crypto.hash160(redeemScript);
        const p2shScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_HASH160,
          scriptHash,
          bitcoin.opcodes.OP_EQUAL,
        ]);

        inputData = {
          hash: input.txid,
          index: input.vout,
          witnessUtxo: {
            script: p2shScript,
            value: BigInt(input.value),
          },
          redeemScript,
          sequence: 0xfffffffe,
        };
      }

      psbt.addInput(inputData);
    }
  };

  await addScriptInputs(escrowInputs, escrowRedeemScript);
  await addScriptInputs(timelockInputs, timelockRedeemScript);

  psbt.addOutput({
    address: destination,
    value: BigInt(destinationValue),
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

  TransactionUtils.appendMetadataOutput(psbt, metadata, TxType.Withdrawal);

  return psbt.toBase64();
}
