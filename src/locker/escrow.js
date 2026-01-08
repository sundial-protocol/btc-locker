/**
 * @fileoverview Time-based escrow script functionality
 * @description Create scripts where one user can withdraw before a deadline and another after
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core.js";

/**
 * Time-based escrow script management class
 * @class EscrowManager
 * @description Creates Bitcoin scripts that implement time-based escrow functionality
 * where one party can withdraw before a deadline and another party can withdraw after
 */
export class EscrowManager extends BTCLockerCore {
  /**
   * Create a time-based escrow script
   * @async
   * @param {number} deadline - Unix timestamp deadline
   * @param {Buffer|string} beforePublicKey - Public key of user who can withdraw before deadline
   * @param {Buffer|string} afterPublicKey - Public key of user who can withdraw after deadline
   * @returns {Promise<Object>} Script details object
   * @returns {string} returns.redeemScript - Redeem script in hex format
   * @returns {string} returns.scriptHash - Script hash in hex format
   * @returns {string} returns.address - P2SH address for the script
   * @returns {number} returns.deadline - The deadline timestamp
   * @returns {string} returns.beforePublicKey - Public key for before-deadline withdrawals
   * @returns {string} returns.afterPublicKey - Public key for after-deadline withdrawals
   * @returns {string} returns.type - Script type identifier
   * @throws {Error} If deadline or public keys are invalid
   * @example
   * const escrow = new EscrowManager();
   * const script = await escrow.createEscrowScript(
   *   1640995200,
   *   userAPublicKey,
   *   userBPublicKey
   * );
   * console.log(script.address);
   */
  async createEscrowScript(deadline, beforePublicKey, afterPublicKey) {
    await this.ensureInitialized();

    // Validate deadline
    if (deadline === undefined || deadline === null) {
      throw new Error("deadline cannot be undefined or null");
    }

    const deadlineNumber = Number(deadline);
    if (!Number.isInteger(deadlineNumber) || deadlineNumber < 0) {
      throw new Error("deadline must be a non-negative integer");
    }

    // Convert and validate public keys
    const beforePubKeyBuffer = this._validateAndConvertPublicKey(beforePublicKey, "beforePublicKey");
    const afterPubKeyBuffer = this._validateAndConvertPublicKey(afterPublicKey, "afterPublicKey");

    // Ensure the public keys are different
    if (beforePubKeyBuffer.equals(afterPubKeyBuffer)) {
      throw new Error("beforePublicKey and afterPublicKey must be different");
    }

    try {
      // Create the escrow script
      // Script logic:
      // IF
      //   <deadline> CHECKLOCKTIMEVERIFY DROP
      //   <afterPublicKey> CHECKSIG
      // ELSE
      //   <beforePublicKey> CHECKSIG
      // ENDIF
      const redeemScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_IF,
          bitcoin.script.number.encode(deadlineNumber),
          bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
          bitcoin.opcodes.OP_DROP,
          afterPubKeyBuffer,
          bitcoin.opcodes.OP_CHECKSIG,
        bitcoin.opcodes.OP_ELSE,
          beforePubKeyBuffer,
          bitcoin.opcodes.OP_CHECKSIG,
        bitcoin.opcodes.OP_ENDIF,
      ]);

      const scriptHash = bitcoin.crypto.hash160(redeemScript);
      const address = bitcoin.payments.p2sh({
        hash: scriptHash,
        network: this.network,
      }).address;

      return {
        redeemScript: redeemScript.toString("hex"),
        scriptHash: scriptHash.toString("hex"),
        address,
        deadline: deadlineNumber,
        beforePublicKey: beforePubKeyBuffer.toString("hex"),
        afterPublicKey: afterPubKeyBuffer.toString("hex"),
        type: "time-escrow",
      };
    } catch (error) {
      throw new Error(`Failed to create escrow script: ${error.message}`);
    }
  }

  /**
   * Create a spending transaction for the escrow script
   * @async
   * @param {Object} scriptData - Script data returned from createEscrowScript
   * @param {string} utxoTxId - Transaction ID of the UTXO to spend
   * @param {number} utxoIndex - Output index of the UTXO to spend
   * @param {number} amount - Amount in satoshis to spend
   * @param {string} outputAddress - Address to send funds to
   * @param {boolean} spendAfterDeadline - Whether to spend after deadline (true) or before (false)
   * @param {Buffer|string} privateKey - Private key corresponding to the appropriate public key
   * @param {number} [currentTime] - Current time for validation (defaults to Date.now())
   * @param {Buffer} [previousTransaction] - Previous transaction buffer (for testing/validation)
   * @returns {Promise<Object>} Transaction details
   * @returns {string} returns.txHex - Raw transaction in hex format
   * @returns {string} returns.txId - Transaction ID
   * @throws {Error} If spending conditions are not met or transaction creation fails
   * @example
   * // Spend before deadline
   * const tx = await escrow.createEscrowSpendingTransaction(
   *   scriptData,
   *   utxoTxId,
   *   0,
   *   100000,
   *   "tb1qaddr...",
   *   false,
   *   beforeUserPrivateKey
   * );
   * 
   * // Spend after deadline
   * const tx = await escrow.createEscrowSpendingTransaction(
   *   scriptData,
   *   utxoTxId,
   *   0,
   *   100000,
   *   "tb1qaddr...",
   *   true,
   *   afterUserPrivateKey,
   *   Date.now()
   * );
   */
  async createEscrowSpendingTransaction(
    scriptData,
    utxoTxId,
    utxoIndex,
    amount,
    outputAddress,
    spendAfterDeadline,
    privateKey,
    currentTime = Date.now(),
    previousTransaction = null
  ) {
    await this.ensureInitialized();

    // Validate inputs
    if (!scriptData || scriptData.type !== "time-escrow") {
      throw new Error("Invalid script data - must be a time-escrow script");
    }

    if (typeof utxoTxId !== "string" || utxoTxId.length !== 64) {
      throw new Error("utxoTxId must be a 64-character hex string");
    }

    if (!Number.isInteger(utxoIndex) || utxoIndex < 0) {
      throw new Error("utxoIndex must be a non-negative integer");
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("amount must be a positive integer");
    }

    if (typeof outputAddress !== "string") {
      throw new Error("outputAddress must be a string");
    }

    // Convert private key to ECPair
    let keyPair;
    try {
      const { ECPair } = getECC();
      if (typeof privateKey === "string") {
        keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, "hex"));
      } else if (Buffer.isBuffer(privateKey)) {
        keyPair = ECPair.fromPrivateKey(privateKey);
      } else {
        throw new Error("privateKey must be a string or Buffer");
      }
    } catch (error) {
      throw new Error(`Invalid private key: ${error.message}`);
    }

    // Validate timing and key correspondence
    const currentTimeSeconds = Math.floor(currentTime / 1000);
    const publicKeyHex = keyPair.publicKey.toString("hex");

    if (spendAfterDeadline) {
      if (currentTimeSeconds <= scriptData.deadline) {
        throw new Error(
          `Cannot spend after deadline yet. Current time: ${currentTimeSeconds}, Deadline: ${scriptData.deadline}`
        );
      }
      if (publicKeyHex !== scriptData.afterPublicKey) {
        throw new Error(`Private key does not correspond to afterPublicKey. Expected: ${scriptData.afterPublicKey}, Got: ${publicKeyHex}`);
      }
    } else {
      if (publicKeyHex !== scriptData.beforePublicKey) {
        throw new Error(`Private key does not correspond to beforePublicKey. Expected: ${scriptData.beforePublicKey}, Got: ${publicKeyHex}`);
      }
    }

    try {
      // Create the transaction manually for better control
      const tx = new bitcoin.Transaction();
      tx.version = 2;

      // Set locktime if spending after deadline
      if (spendAfterDeadline) {
        tx.locktime = scriptData.deadline;
      }

      // Add input
      tx.addInput(Buffer.from(utxoTxId, 'hex').reverse(), utxoIndex, 0xffffffff);

      // Add output (subtract a reasonable fee)
      const fee = 1000; // 1000 satoshis fee
      const outputAmount = amount - fee;
      
      if (outputAmount <= 0) {
        throw new Error("Amount too small to cover fee");
      }

      // Get output script for the destination address
      let outputScript;
      try {
        outputScript = bitcoin.address.toOutputScript(outputAddress, this.network);
      } catch (error) {
        throw new Error(`Invalid output address: ${error.message}`);
      }

      tx.addOutput(outputScript, BigInt(outputAmount));

      // Create signature hash
      const hashType = bitcoin.Transaction.SIGHASH_ALL;
      const redeemScript = Buffer.from(scriptData.redeemScript, "hex");
      const sigHash = tx.hashForSignature(0, redeemScript, hashType);

      // Sign the transaction
      const signature = keyPair.sign(sigHash);
      const signatureWithHashType = Buffer.concat([signature, Buffer.from([hashType])]);

      // Create the unlocking script
      let scriptSig;
      if (spendAfterDeadline) {
        // Script path: true branch (after deadline)
        scriptSig = bitcoin.script.compile([
          signatureWithHashType,
          bitcoin.opcodes.OP_TRUE, // Choose IF branch
          redeemScript
        ]);
      } else {
        // Script path: false branch (before deadline)
        scriptSig = bitcoin.script.compile([
          signatureWithHashType,
          bitcoin.opcodes.OP_FALSE, // Choose ELSE branch
          redeemScript
        ]);
      }

      // Set the input script
      tx.setInputScript(0, scriptSig);

      return {
        txHex: tx.toHex(),
        txId: tx.getId(),
      };
    } catch (error) {
      throw new Error(`Failed to create spending transaction: ${error.message}`);
    }
  }

  /**
   * Validate and convert a public key to Buffer format
   * @private
   * @param {Buffer|string} publicKey - Public key to validate
   * @param {string} paramName - Parameter name for error messages
   * @returns {Buffer} Validated public key buffer
   * @throws {Error} If public key is invalid
   */
  _validateAndConvertPublicKey(publicKey, paramName) {
    if (publicKey === undefined || publicKey === null) {
      throw new Error(`${paramName} cannot be undefined or null`);
    }

    let publicKeyBuffer;
    if (typeof publicKey === "string") {
      if (!/^[0-9a-fA-F]+$/.test(publicKey)) {
        throw new Error(
          `${paramName} string must contain only hexadecimal characters`
        );
      }
      try {
        publicKeyBuffer = Buffer.from(publicKey, "hex");
      } catch (error) {
        throw new Error(`Invalid ${paramName} hex string: ${error.message}`);
      }
    } else if (Buffer.isBuffer(publicKey)) {
      publicKeyBuffer = publicKey;
    } else {
      throw new Error(`${paramName} must be a string or Buffer`);
    }

    // Validate public key length
    if (publicKeyBuffer.length !== 33 && publicKeyBuffer.length !== 65) {
      throw new Error(
        `Invalid ${paramName} length: ${publicKeyBuffer.length}. Expected 33 (compressed) or 65 (uncompressed) bytes`
      );
    }

    return publicKeyBuffer;
  }
}