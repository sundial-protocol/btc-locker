/**
 * @fileoverview Generic transaction construction functions (spending and funding)
 */

import * as bitcoin from "bitcoinjs-lib";
import { LockerContext } from "../core.js";
import type { UTXO, BaseTransactionParams } from "../../types.js";
import { TransactionUtils, ScriptUtils } from "../../utils/index.js";
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
  /** Source address of the inputs (used to derive scriptPubKey for BIP143 segwit sighash) */
  sourceAddress?: string;
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

  const locktime = ScriptUtils.extractLocktimeFromScript(redeemScript);
  // Only look for CSV if the script is not CLTV
  const csvSequence =
    locktime === null
      ? ScriptUtils.extractSequenceFromScript(redeemScript)
      : null;

  if (locktime !== null) {
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

  const psbt = new bitcoin.Psbt({ network: ctx.network });

  if (locktime !== null) {
    psbt.setLocktime(locktime);
  }

  if (csvSequence !== null) {
    // BIP-68 requires transaction version ≥ 2 for CSV to be enforced
    psbt.setVersion(2);
  }

  const witnessScript = Buffer.from(redeemScript, "hex");
  const p2wsh = bitcoin.payments.p2wsh({
    redeem: { output: witnessScript, network: ctx.network },
    network: ctx.network,
  });

  // BIP-68 block-based nSequence: low 16 bits hold the block count,
  // bit 22 (type flag) = 0 for blocks, bit 31 (disable flag) = 0.
  const inputSequence =
    locktime !== null
      ? 0xfffffffe // CLTV: enable nLockTime
      : csvSequence !== null
      ? csvSequence & 0xffff // CSV: BIP-68 block-based relative locktime
      : 0xffffffff; // plain script: final sequence

  inputs.forEach((utxo) => {
    const txHash = Buffer.from(utxo.txid, "hex").reverse();
    psbt.addInput({
      hash: txHash,
      index: utxo.vout,
      sequence: inputSequence,
      witnessScript,
      witnessUtxo: {
        script: p2wsh.output!,
        value: BigInt(utxo.value),
      },
    });
  });

  outputs.forEach((output) => {
    psbt.addOutput({ address: output.address, value: BigInt(output.value) });
  });

  TransactionUtils.appendMetadataOutput(psbt, params.metadata);

  return psbt.toBase64();
}

export async function createFundingTransaction(
  ctx: LockerContext,
  params: FundingTransactionParams,
): Promise<string> {
  const { inputs, outputs, sourceAddress } = params;

  const psbt = new bitcoin.Psbt({ network: ctx.network });
  TransactionUtils.addWitnessInputs(
    psbt,
    inputs,
    sourceAddress
      ? bitcoin.address.toOutputScript(sourceAddress, ctx.network)
      : undefined,
  );

  for (const output of outputs) {
    psbt.addOutput({
      address: output.address,
      value: BigInt(output.value),
    });
  }

  return psbt.toBase64();
}
