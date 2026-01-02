/**
 * @fileoverview Yield distribution functionality
 * @module locker/yield
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core.js";

/**
 * Yield distribution class for distributing yields to timelock addresses
 * @class YieldDistributor
 * @extends BTCLockerCore
 */
export class YieldDistributor extends BTCLockerCore {
  /**
   * Distribute yield back to a timelock script
   * @param {Object} params - Distribution parameters
   * @param {Array} params.inputs - Input UTXOs from yield source
   * @param {string} params.timelockAddress - Timelock script address to send yield to
   * @param {number} params.amount - Amount to distribute in satoshis
   * @param {string} params.privateKey - Private key for signing inputs
   * @param {string} params.memo - Optional memo for the distribution
   * @returns {Object} Signed distribution transaction
   */
  async distributeYield(params) {
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
          }).output,
          value: input.value,
        },
      };

      psbt.addInput(inputData);
    }

    // Add yield distribution output
    psbt.addOutput({
      address: timelockAddress,
      value: amount,
    });

    // Add change output if needed (above dust threshold)
    if (changeAmount > 546) {
      const sourceAddress = bitcoin.payments.p2wpkh({
        pubkey: keyPair.publicKey,
        network: this.network,
      }).address;

      psbt.addOutput({
        address: sourceAddress,
        value: changeAmount,
      });
    }

    // Sign all inputs
    for (let i = 0; i < inputs.length; i++) {
      try {
        psbt.signInput(i, keyPair);
      } catch (error) {
        console.warn(`Could not sign input ${i}:`, error.message);
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
