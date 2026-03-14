/**
 * @fileoverview Generic transaction construction functions (spending and funding)
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, LockerContext } from "../core.js";
import type { UTXO, BaseTransactionParams } from "../../types.js";
import MetadataUtils from "../../utils/metadata.js";
import BitcoinAPI from "../../bitcoin-api.js";

/**
 * Transaction output specification
 * @interface TransactionOutput
 * @description Specifies destination address and value for transaction outputs
 */
export interface TransactionOutput {
  /** Destination Bitcoin address */
  address: string;
  /** Output value in satoshis */
  value: number;
}

/**
 * Parameters for creating spending transactions
 * @interface SpendingTransactionParams
 * @extends BaseTransactionParams
 * @description Configuration for spending from time-locked Bitcoin scripts
 */
export interface SpendingTransactionParams extends BaseTransactionParams {
  /** Array of unspent transaction outputs to spend */
  inputs: UTXO[];
  /** Output destinations and amounts */
  outputs: TransactionOutput[];
  /** Redeem script in hexadecimal format */
  redeemScript: string;
  /** Optional locktime for the transaction */
  locktime?: number;
}

/**
 * Parameters for creating funding transactions
 * @interface FundingTransactionParams
 * @extends BaseTransactionParams
 * @description Configuration for creating transactions that fund Bitcoin scripts
 */
export interface FundingTransactionParams extends BaseTransactionParams {
  /** Array of unspent transaction outputs to use as funding */
  inputs: UTXO[];
  /** Output destinations and amounts */
  outputs: TransactionOutput[];
}

/**
 * Parameters for signing transactions
 * @interface TransactionSigningParams
 */
export interface TransactionSigningParams {
  /** Unsigned transaction hex or PSBT */
  unsignedTransaction: string;
  /** Private keys for signing the transaction */
  privateKeys: string[];
  /** Optional redeem script for spending transactions */
  redeemScript?: string;
  /** Transaction type to determine signing method */
  transactionType: "funding" | "spending";
}

/**
 * Parameters for signing spending transactions
 * @interface SpendingTransactionSigningParams
 */
export interface SpendingTransactionSigningParams {
  /** Unsigned transaction hex or PSBT */
  unsignedTransaction: string;
  /** Private keys for signing the transaction */
  privateKeys: string[];
  /** Redeem script for spending transactions */
  redeemScript: string;
}

/**
 * Parameters for submitting signed transactions
 * @interface TransactionSubmissionParams
 */
export interface TransactionSubmissionParams {
  /** Signed transaction hex */
  signedTransaction: string;
  /** Optional API instance for broadcasting */
  api?: BitcoinAPI;
}

export async function createSpendingTransaction(
  ctx: LockerContext,
  params: SpendingTransactionParams,
): Promise<string> {
  const { inputs, outputs, redeemScript } = params;

  const redeemScriptBuffer = Buffer.from(redeemScript, "hex");
  let locktime: number | null = null;

  try {
    const ops = bitcoin.script.decompile(redeemScriptBuffer);
    if (
      ops &&
      ops.length > 1 &&
      ops[1] === bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY
    ) {
      if (typeof ops[0] === "number") {
        locktime = ops[0];
      } else if (Buffer.isBuffer(ops[0])) {
        let locktimeValue = 0;
        for (let i = 0; i < ops[0].length; i++) {
          locktimeValue += ops[0][i] << (8 * i);
        }
        locktime = locktimeValue;
      }

      if (locktime) {
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime < locktime) {
          const timeRemaining = locktime - currentTime;
          const expiryDate = new Date(locktime * 1000).toISOString();
          throw new Error(
            `Timelock has not expired yet. ` +
              `Current time: ${currentTime}, Locktime: ${locktime}. ` +
              `Time remaining: ${timeRemaining} seconds. ` +
              `Expires at: ${expiryDate}`,
          );
        }
      }
    }
  } catch (error) {
    if ((error as Error).message.includes("Timelock has not expired")) {
      throw error;
    }
  }

  const psbt = new bitcoin.Psbt({ network: ctx.network });

  if (locktime) {
    psbt.setLocktime(locktime);
  }

  inputs.forEach((utxo) => {
    const txHash = Buffer.from(utxo.txid, "hex").reverse();
    psbt.addInput({
      hash: txHash,
      index: utxo.vout,
      sequence: locktime ? 0xfffffffe : 0xffffffff,
    });
  });

  outputs.forEach((output) => {
    psbt.addOutput({ address: output.address, value: BigInt(output.value) });
  });

  if (params.metadata) {
    psbt.addOutput(MetadataUtils.toOutput(params.metadata));
  }

  return psbt.toHex();
}

export async function createFundingTransaction(
  ctx: LockerContext,
  params: FundingTransactionParams,
): Promise<string> {
  const { inputs, outputs } = params;

  const psbt = new bitcoin.Psbt({ network: ctx.network });

  for (const input of inputs) {
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.alloc(0),
        value: BigInt(input.value),
      },
    });
  }

  for (const output of outputs) {
    psbt.addOutput({
      address: output.address,
      value: BigInt(output.value),
    });
  }

  return psbt.toBase64();
}
