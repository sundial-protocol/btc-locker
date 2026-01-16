/**
 * @fileoverview Yield distribution functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core";
import type { UTXO } from "../types";

interface YieldInput extends UTXO {
  txid: string;
  vout: number;
  value: number;
}

interface YieldDistributionParams {
  inputs: YieldInput[];
  timelockAddress: string;
  amount: number;
  privateKey: string;
  memo?: string;
  changeAddress?: string;
  feeRate?: number;
}

interface YieldDistributionResult {
  transaction: bitcoin.Transaction;
  hex: string;
  txid: string;
  size: number;
  fee: number;
  memo: string;
  distribution: {
    amount: number;
    destination: string;
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
    const { ECPair } = getECC();
    const { inputs, timelockAddress, amount, privateKey, memo } = params;

    const psbt = new bitcoin.Psbt({ network: this.network });
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, "hex"), {
      network: this.network,
    });

    // Calculate total input value
    const totalInputValue = inputs.reduce((sum, input) => sum + input.value, 0);
    const defaultFee = 1000; // Default fee of 1000 satoshis
    const changeAmount = totalInputValue - amount - defaultFee;

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
    if (changeAmount > 546) {
      const sourceAddress = bitcoin.payments.p2wpkh({
        pubkey: keyPair.publicKey,
        network: this.network,
      }).address!;

      psbt.addOutput({
        address: sourceAddress,
        value: BigInt(changeAmount),
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
      fee: changeAmount <= 546 ? totalInputValue - amount : defaultFee,
      memo: memo || "Yield distribution to timelock",
      distribution: {
        amount,
        destination: timelockAddress,
        change: changeAmount > 546 ? changeAmount : 0,
      },
    };
  }
}