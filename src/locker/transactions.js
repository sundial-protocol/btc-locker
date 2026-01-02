/**
 * @fileoverview Transaction creation and spending functionality
 * @module locker/transactions
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core.js";

/**
 * Transaction management class for creating and spending Bitcoin transactions
 * @class TransactionManager
 * @extends BTCLockerCore
 */
export class TransactionManager extends BTCLockerCore {
  /**
   * Create spending transaction for timelock scripts
   * @param {Object} params - Transaction parameters
   * @param {Array} params.inputs - Input UTXOs
   * @param {Array} params.outputs - Output destinations
   * @param {string} params.redeemScript - Redeem script (hex)
   * @param {Array} params.privateKeys - Private keys for signing
   * @returns {Object} Transaction details
   */
  async createSpendingTransaction(params) {
    await this.ensureInitialized();
    const { ECPair } = getECC();
    const { inputs, outputs, redeemScript, privateKeys } = params;

    // First, check if this is a timelock script and if it has expired
    const redeemScriptBuffer = Buffer.from(redeemScript, "hex");
    let locktime = null;

    try {
      const ops = bitcoin.script.decompile(redeemScriptBuffer);
      if (
        ops &&
        ops.length > 1 &&
        ops[1] === bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY
      ) {
        // Extract locktime from the first operation (could be number or Buffer)
        if (typeof ops[0] === "number") {
          locktime = ops[0];
        } else if (Buffer.isBuffer(ops[0])) {
          // Convert buffer to number (little endian)
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
                `Expires at: ${expiryDate}`
            );
          }
        }
      }
    } catch (error) {
      if (error.message.includes("Timelock has not expired")) {
        throw error; // Re-throw timelock errors
      }
      console.warn("Could not parse locktime from script:", error.message);
    }

    // Create transaction manually for better P2SH support
    const tx = new bitcoin.Transaction();
    tx.version = 2;

    if (locktime) {
      tx.locktime = locktime;
    }

    // Add inputs
    inputs.forEach((utxo) => {
      // For OP_CHECKLOCKTIMEVERIFY, the input sequence must be < 0xffffffff
      // Convert txid string to Buffer and reverse for correct byte order
      const txHash = Buffer.from(utxo.txid, "hex").reverse();
      tx.addInput(txHash, utxo.vout, 0xfffffffe);
    });

    // Add outputs
    outputs.forEach((output) => {
      tx.addOutput(
        bitcoin.address.toOutputScript(output.address, this.network),
        output.value
      );
    });

    // Sign inputs
    inputs.forEach((utxo, inputIndex) => {
      // For simple timelock scripts, use the first private key
      // For multisig or HODL scripts, this would need to be adjusted
      const privateKey =
        typeof privateKeys[0] === "string"
          ? Buffer.from(privateKeys[0], "hex")
          : privateKeys[0];

      const keyPair = ECPair.fromPrivateKey(privateKey, {
        network: this.network,
      });
      const redeemScriptBuf = Buffer.from(redeemScript, "hex");
      const hashType = bitcoin.Transaction.SIGHASH_ALL;

      // Create signature hash
      const signatureHash = tx.hashForSignature(
        inputIndex,
        redeemScriptBuf,
        hashType
      );

      // Sign with canonical DER encoding
      const signature = keyPair.sign(signatureHash);
      const signatureWithHashType = bitcoin.script.signature.encode(
        signature,
        hashType
      );

      // Create scriptSig
      const scriptSig = bitcoin.script.compile([
        signatureWithHashType,
        redeemScriptBuf,
      ]);

      // Set input script
      tx.setInputScript(inputIndex, scriptSig);
    });

    return tx;
  }

  /**
   * Create a funding transaction to send Bitcoin to a timelock script
   * @param {Object} params - Transaction parameters
   * @param {Array} params.inputs - Input UTXOs
   * @param {Array} params.outputs - Output destinations
   * @param {string} params.privateKey - Private key for signing inputs
   * @returns {Object} Signed transaction
   */
  async createFundingTransaction(params) {
    await this.ensureInitialized();
    const { ECPair } = getECC();
    const { inputs, outputs, privateKey } = params;

    const psbt = new bitcoin.Psbt({ network: this.network });
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, "hex"), {
      network: this.network,
    });

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

    // Add outputs
    for (const output of outputs) {
      psbt.addOutput({
        address: output.address,
        value: output.value,
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
    return psbt.extractTransaction();
  }
}
