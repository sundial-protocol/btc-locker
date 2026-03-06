/**
 * @fileoverview Yield distribution functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core";
import { FeeUtils } from "../utils";
import { FeePriorities } from "../utils/fees";
import type { UTXO } from "../types";
import BitcoinAPI from "../bitcoin-api";
import MetadataUtils, { SundialMetadata } from "../utils/metadata";

/**
 * Yield input type
 * @description UTXO input for yield distribution operations
 */
export type YieldInput = UTXO;

/**
 * Parameters for yield distribution
 * @interface YieldDistributionParams
 * @description Configuration for distributing yield from time-locked Bitcoin funds
 */
export interface YieldDistributionParams {
  /** Array of unspent transaction outputs from timelock (optional - will fetch from address if not provided) */
  inputs?: YieldInput[];
  /** Source address for automatic UTXO selection (required if inputs not provided) */
  sourceAddress?: string;
  /** Bitcoin API instance for fetching UTXOs (required if inputs not provided) */
  api?: BitcoinAPI;
  /** Address of the timelock script */
  timelockAddress: string;
  /** Amount to distribute in satoshis */
  amount: number;
  /** Optional metadata for the distribution */
  metadata?: SundialMetadata | string;
  /** Optional change address for remaining funds */
  changeAddress?: string;
  /** Fee priority levels for user-friendly fee selection */
  priority?: FeePriorities;
}

/**
 * Result of yield distribution
 * @interface YieldDistributionResult
 * @description Transaction result with additional yield distribution metadata
 */
export interface YieldDistributionResult {
  /** Bitcoin transaction object */
  transaction: bitcoin.Transaction;
  /** Transaction in hexadecimal format */
  hex: string;
  /** Transaction ID (hash) */
  txid: string;
  /** Transaction size in bytes */
  size: number;
  /** Transaction fee in satoshis */
  fee: number;
  /** Metadata associated with the yield distribution */
  metadata: string;
  /** Distribution details */
  distribution: {
    /** Amount distributed in satoshis */
    amount: number;
    /** Destination address for the distribution */
    destination: string;
    /** Change amount in satoshis */
    change: number;
  };
}

/**
 * Parameters for signing yield distribution transactions
 * @interface YieldDistributionSigningParams
 * @description Configuration for signing unsigned yield distribution transactions
 */
export interface YieldDistributionSigningParams {
  /** Unsigned transaction hex or PSBT */
  unsignedTransaction: string;
  /** Private key for signing the distribution transaction */
  privateKey: string;
  /** Fee priority for the transaction */
  priority?: FeePriorities;
}

/**
 * Yield distribution class for distributing yields to timelock addresses
 * @class YieldDistributor
 */
export class YieldDistributor extends BTCLockerCore {
  /**
   * Create an unsigned yield distribution transaction
   * @async
   * @param params - Distribution parameters
   * @returns Unsigned PSBT base64 string
   * @throws If insufficient funds or invalid parameters
   * @example
   * const yieldDistributor = new YieldDistributor();
   * const unsignedPsbt = await yieldDistributor.distributeYield({
   *   inputs: [{ txid: '...', vout: 0, value: 50000 }],
   *   timelockAddress: '3...',
   *   amount: 45000,
   *   metadata: 'Quarterly yield distribution'
   * });
   */
  async distributeYield(params: YieldDistributionParams): Promise<string> {
    await this.ensureInitialized();
    const {
      inputs: providedInputs,
      sourceAddress,
      api,
      timelockAddress,
      amount,
      metadata,
      priority = FeePriorities.MEDIUM,
    } = params;

    // Validate that either inputs or sourceAddress+api are provided
    if (!providedInputs && (!sourceAddress || !api)) {
      throw new Error(
        "Either inputs or both sourceAddress and api must be provided",
      );
    }

    let inputs: YieldInput[] = [];

    if (providedInputs) {
      // Use provided inputs
      inputs = providedInputs;
    } else if (api && sourceAddress) {
      // Fetch UTXOs from address
      const apiUtxos = await api.getAddressUtxos(sourceAddress);
      inputs = apiUtxos.filter((utxo) => utxo.status.confirmed);
    }

    if (inputs.length === 0) {
      throw new Error(
        `No confirmed UTXOs available at address ${sourceAddress}`,
      );
    }

    const psbt = new bitcoin.Psbt({ network: this.network });

    // Calculate fee based on priority
    const feeRate = await FeeUtils.queryChainFeeRates(priority);
    const outputCount = () => {
      let count = 1;
      if (metadata) count += 1;
      if (params.changeAddress) count += 1;
      return count;
    }; // yield output + optional change

    const estimatedFee = FeeUtils.estimateFee(
      inputs.length,
      outputCount(),
      feeRate,
    );

    // Calculate total input value and change
    const totalInputValue = inputs.reduce((sum, input) => sum + input.value, 0);
    const changeResult = FeeUtils.calculateChange(
      totalInputValue,
      amount,
      estimatedFee,
    );

    // Add inputs (without signing information)
    for (const input of inputs) {
      const inputData = {
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: Buffer.alloc(0), // Will be filled during signing
          value: BigInt(input.value),
        },
      };

      psbt.addInput(inputData);
    }

    // Add yield distribution output
    psbt.addOutput({
      address: timelockAddress,
      value: BigInt(amount),
    });

    // Add change output if needed (above dust threshold)
    if (changeResult.isAboveDustThreshold) {
      // Note: We can't determine the source address without the private key
      // This will need to be handled during signing or passed as a parameter
      psbt.addOutput({
        address: params.changeAddress || timelockAddress, // fallback to timelock address
        value: BigInt(changeResult.changeAmount),
      });
    }

    if (metadata) {
      psbt.addOutput(MetadataUtils.toOutput(metadata));
    }

    // Return unsigned PSBT as base64
    return psbt.toBase64();
  }

  /**
   * Convenience method to sign and submit a yield distribution transaction
   * @async
   * @param signingParams - Yield distribution signing parameters
   * @param metadata - Optional metadata for the distribution
   * @param api - Optional Bitcoin API instance
   * @returns Transaction result with yield distribution metadata
   */
  async signAndSubmitYieldDistribution(
    signingParams: YieldDistributionSigningParams,
    metadata?: string,
    api?: BitcoinAPI,
  ): Promise<YieldDistributionResult> {
    const signedTx = await this.signTransaction(
      signingParams.unsignedTransaction,
      signingParams.privateKey,
    );

    const txid = await this.submitTransaction(signedTx, { api });
    const tx = bitcoin.Transaction.fromHex(signedTx);

    // Build result with yield distribution metadata
    const outputs = tx.outs;
    const mainOutput = outputs[0];
    const changeOutput = outputs.length > 1 ? outputs[1] : null;

    const feeRate = await FeeUtils.queryChainFeeRates(signingParams.priority);
    const fee = FeeUtils.estimateFee(tx.ins.length, outputs.length, feeRate);

    return {
      transaction: tx,
      hex: signedTx,
      txid: txid,
      size: tx.byteLength(),
      fee: fee,
      metadata: metadata || "Yield distribution to timelock",
      distribution: {
        amount: Number(mainOutput.value),
        destination: "unknown", // Would need to decode from script
        change: changeOutput ? Number(changeOutput.value) : 0,
      },
    };
  }
}
