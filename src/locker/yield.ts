/**
 * @fileoverview Yield distribution functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core";
import { FeeUtils } from "../utils";
import type { UTXO } from "../types";
import BitcoinAPI, { ApiUTXO } from "../bitcoin-api";

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
  /** Optional memo for the distribution */
  memo?: string;
  /** Optional change address for remaining funds */
  changeAddress?: string;
  /** Optional fee rate in satoshis per byte */
  feeRate?: number;
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
  /** Memo associated with the yield distribution */
  memo: string;
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
   *   memo: 'Quarterly yield distribution'
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
      memo 
    } = params;

    // Validate that either inputs or sourceAddress+api are provided
    if (!providedInputs && (!sourceAddress || !api)) {
      throw new Error("Either inputs or both sourceAddress and api must be provided");
    }

    let inputs: YieldInput[];
    
    if (providedInputs) {
      // Use provided inputs
      inputs = providedInputs;
    } else {
      // Fetch UTXOs from address
      const apiUtxos = await api!.getAddressUtxos(sourceAddress!);
      inputs = apiUtxos.filter(utxo => utxo.status.confirmed);
      
      if (inputs.length === 0) {
        throw new Error(`No confirmed UTXOs available at address ${sourceAddress}`);
      }
    }

    const psbt = new bitcoin.Psbt({ network: this.network });

    // Calculate total input value and change
    const totalInputValue = inputs.reduce((sum, input) => sum + input.value, 0);
    const changeResult = FeeUtils.calculateChange(totalInputValue, amount, FeeUtils.DEFAULT_FEE);

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

    // Return unsigned PSBT as base64
    return psbt.toBase64();
  }

  /**
   * Convenience method to sign and submit a yield distribution transaction
   * @async
   * @param signingParams - Yield distribution signing parameters
   * @param memo - Optional memo for the distribution
   * @param api - Optional Bitcoin API instance
   * @returns Transaction result with yield distribution metadata
   */
  async signAndSubmitYieldDistribution(
    signingParams: YieldDistributionSigningParams,
    memo?: string,
    api?: any
  ): Promise<YieldDistributionResult> {
    const signedTx = await this.signTransaction(
      signingParams.unsignedTransaction, 
      signingParams.privateKey
    );
    
    const txid = await this.submitTransaction(signedTx, { api });
    const tx = bitcoin.Transaction.fromHex(signedTx);
    
    // Build result with yield distribution metadata
    const outputs = tx.outs;
    const mainOutput = outputs[0];
    const changeOutput = outputs.length > 1 ? outputs[1] : null;

    return {
      transaction: tx,
      hex: signedTx,
      txid: txid,
      size: tx.byteLength(),
      fee: 0, // TODO: Calculate actual fee if needed
      memo: memo || "Yield distribution to timelock",
      distribution: {
        amount: Number(mainOutput.value),
        destination: "unknown", // Would need to decode from script
        change: changeOutput ? Number(changeOutput.value) : 0,
      },
    };
  }
}