import * as bitcoin from "bitcoinjs-lib";
import type {
  BaseTransactionParams,
  ProtocolFeeParams,
  TransactionResult,
  UTXO,
} from "../../types";
import type { ApiUTXO } from "../../bitcoin-api";
import { FeeUtils, ScriptUtils } from "../../utils";
import { FeePriorities } from "../../utils/fees";
import MetadataUtils from "../../utils/metadata";
import type { LockerContext } from "../core";

/**
 * Parameters for Dawn withdrawal
 * @interface DawnWithdrawalParams
 * @extends BaseTransactionParams
 * @extends ProtocolFeeParams
 * @description Configuration for withdrawing from both escrow and timelock Dawn staking outputs
 */
export interface DawnWithdrawalParams
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

/**
 * Result of Dawn withdrawal
 * @interface DawnWithdrawalResult
 * @extends TransactionResult
 * @description Transaction result with detailed input and output information for Dawn withdrawal
 */
export interface DawnWithdrawalResult extends TransactionResult {
  /** Input details */
  inputs: {
    /** Total value from escrow inputs in satoshis */
    escrowValue: number;
    /** Total value from timelock inputs in satoshis */
    timelockValue: number;
    /** Total input value in satoshis */
    totalValue: number;
  };
  /** Output details */
  outputs: {
    /** Destination address for withdrawn funds */
    destination: string;
    /** Final output value after fees in satoshis */
    destinationValue: number;
    /** Optional protocol fee amount in satoshis */
    protocolFeeAmount?: number;
  };
}

export async function createDawnWithdrawalTransaction(
  ctx: LockerContext,
  params: DawnWithdrawalParams,
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
      const apiUtxos = await ctx.api.getAddressUtxos(escrowAddress);
      escrowInputs = apiUtxos.filter(
        (apiUtxo: ApiUTXO) => apiUtxo.status?.confirmed,
      );
    } catch (error) {
      throw new Error(
        `Failed to fetch escrow UTXOs from ${escrowAddress}: ${(error as Error).message}`,
      );
    }
  }

  if (!providedTimelockInputs) {
    try {
      const apiUtxos = await ctx.api.getAddressUtxos(timelockAddress);
      timelockInputs = apiUtxos.filter(
        (apiUtxo: ApiUTXO) => apiUtxo.status?.confirmed,
      );
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

  if (destinationValue <= 546) {
    throw new Error(
      "Destination output amount would be below dust threshold after fees",
    );
  }

  if (protocolFeeAmount && protocolFeeAmount < 546) {
    throw new Error(
      `Protocol fee amount ${protocolFeeAmount} is below dust threshold 546`,
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

  if (feeAddress && protocolFeeAmount && protocolFeeAmount >= 546) {
    psbt.addOutput({
      address: feeAddress,
      value: BigInt(protocolFeeAmount),
    });
  }

  if (metadata) {
    psbt.addOutput(MetadataUtils.toOutput(metadata));
  }

  return psbt.toBase64();
}
