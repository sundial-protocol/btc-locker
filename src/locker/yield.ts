/**
 * @fileoverview Yield distribution functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core";
import { KeyUtils, FeeUtils } from "../utils";
import type { UTXO } from "../types";

/**
 * Yield input with transaction details
 * @interface YieldInput
 * @description UTXO input specifically for yield distribution operations
 * @extends UTXO
 */
export interface YieldInput extends UTXO {
  /** Transaction ID */
  txid: string;
  /** Output index */
  vout: number;
  /** Output value in satoshis */
  value: number;
}

/**
 * Parameters for yield distribution
 * @interface YieldDistributionParams
 * @description Configuration for distributing yield from time-locked Bitcoin funds
 */
export interface YieldDistributionParams {
  /** Array of unspent transaction outputs from timelock */
  inputs: YieldInput[];
  /** Address of the timelock script */
  timelockAddress: string;
  /** Amount to distribute in satoshis */
  amount: number;
  /** Private key for signing the distribution transaction */
  privateKey: string;
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
 * Yield distribution class for distributing yields to timelock addresses
 * @class YieldDistributor
 */
export class YieldDistributor extends BTCLockerCore {
  /**
   * Distribute yield back to a timelock script
   * @async
   * @param params - Distribution parameters
   * @returns Signed distribution transaction object
   * @throws If insufficient funds or invalid parameters
   * @example
   * const yieldDistributor = new YieldDistributor();
   * const tx = await yieldDistributor.distributeYield({
   *   inputs: [{ txid: '...', vout: 0, value: 50000 }],
   *   timelockAddress: '3...',
   *   amount: 45000,
   *   privateKey: '...',
   *   memo: 'Quarterly yield distribution'
   * });
   */
  async distributeYield(params: YieldDistributionParams): Promise<YieldDistributionResult> {
    await this.ensureInitialized();
    const { inputs, timelockAddress, amount, privateKey, memo } = params;

    const psbt = new bitcoin.Psbt({ network: this.network });
    // Create key pair using shared utility
    const { ECPair } = getECC();
    const keyPair = KeyUtils.createKeyPair(privateKey, ECPair, this.network);

    // Calculate total input value and change
    const totalInputValue = inputs.reduce((sum, input) => sum + input.value, 0);
    const changeResult = FeeUtils.calculateChange(totalInputValue, amount, FeeUtils.DEFAULT_FEE);

    // Add inputs
    for (const input of inputs) {
      const inputData = {
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: bitcoin.payments.p2wpkh({
            pubkey: keyPair.publicKey,
            network: this.network,
          }).output!,
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
      const sourceAddress = bitcoin.payments.p2wpkh({
        pubkey: keyPair.publicKey,
        network: this.network,
      }).address!;

      psbt.addOutput({
        address: sourceAddress,
        value: BigInt(changeResult.changeAmount),
      });
    }

    // Sign all inputs
    for (let i = 0; i < inputs.length; i++) {
      try {
        psbt.signInput(i, keyPair);
      } catch (error) {
        console.warn(`Could not sign input ${i}:`, (error as Error).message);
        throw error; // Re-throw to help with debugging
      }
    }

    // Finalize and extract transaction
    psbt.finalizeAllInputs();
    const transaction = psbt.extractTransaction();

    // Return transaction with metadata
    return {
      transaction,
      hex: transaction.toHex(),
      txid: transaction.getId(),
      size: transaction.byteLength(),
      fee: changeResult.adjustedFee,
      memo: memo || "Yield distribution to timelock",
      distribution: {
        amount,
        destination: timelockAddress,
        change: changeResult.changeAmount,
      },
    };
  }
}