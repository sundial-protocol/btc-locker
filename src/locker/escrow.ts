/**
 * @fileoverview Time-based escrow script functionality
 * @description Create scripts where one user can withdraw before a deadline and another after
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core";
import type { ScriptInfo } from "../types";

interface EscrowSpendingTransaction {
  txHex: string;
  txId: string;
}

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
   * @param deadline - Unix timestamp deadline
   * @param beforePublicKey - Public key of user who can withdraw before deadline
   * @param afterPublicKey - Public key of user who can withdraw after deadline
   * @returns Script details object
   * @throws If deadline or public keys are invalid
   * @example
   * const escrow = new EscrowManager();
   * const script = await escrow.createEscrowScript(
   *   1640995200,
   *   userAPublicKey,
   *   userBPublicKey
   * );
   * console.log(script.address);
   */
  async createEscrowScript(deadline: number, beforePublicKey: Buffer | string, afterPublicKey: Buffer | string): Promise<ScriptInfo> {
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
      }).address!;

      return {
        redeemScript: Buffer.from(redeemScript).toString("hex"),
        scriptHash: Buffer.from(scriptHash).toString("hex"),
        address,
        type: "time-escrow",
        locktime: deadlineNumber,
        beforePublicKey: beforePubKeyBuffer.toString("hex"),
        afterPublicKey: afterPubKeyBuffer.toString("hex"),
      };
    } catch (error) {
      throw new Error(`Failed to create escrow script: ${(error as Error).message}`);
    }
  }

  /**
   * Create a spending transaction for the escrow script
   * @async
   * @param scriptData - Script data returned from createEscrowScript
   * @param utxoTxId - Transaction ID of the UTXO to spend
   * @param utxoIndex - Output index of the UTXO to spend
   * @param amount - Amount in satoshis to spend
   * @param outputAddress - Address to send funds to
   * @param spendAfterDeadline - Whether to spend after deadline (true) or before (false)
   * @param privateKey - Private key corresponding to the appropriate public key
   * @param currentTime - Current time for validation (defaults to Date.now())
   * @param previousTransaction - Previous transaction buffer (for testing/validation)
   * @returns Transaction details
   * @throws If spending conditions are not met or transaction creation fails
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
    scriptData: ScriptInfo,
    utxoTxId: string,
    utxoIndex: number,
    amount: number,
    outputAddress: string,
    spendAfterDeadline: boolean,
    privateKey: Buffer | string,
    currentTime: number = Date.now(),
    previousTransaction: Buffer | null = null
  ): Promise<EscrowSpendingTransaction> {
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
    let keyPair: any;
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
      throw new Error(`Invalid private key: ${(error as Error).message}`);
    }

    // Validate timing and key correspondence
    const currentTimeSeconds = Math.floor(currentTime / 1000);
    const publicKeyHex = keyPair.publicKey.toString("hex");

    if (spendAfterDeadline) {
      if (currentTimeSeconds <= scriptData.locktime!) {
        throw new Error(
          `Cannot spend after deadline yet. Current time: ${currentTimeSeconds}, Deadline: ${scriptData.locktime}`
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
        tx.locktime = scriptData.locktime!;
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
      let outputScript: Buffer;
      try {
        outputScript = Buffer.from(bitcoin.address.toOutputScript(outputAddress, this.network));
      } catch (error) {
        throw new Error(`Invalid output address: ${(error as Error).message}`);
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
      let scriptSig: Buffer;
      if (spendAfterDeadline) {
        // Script path: true branch (after deadline)
        scriptSig = Buffer.from(bitcoin.script.compile([
          signatureWithHashType,
          bitcoin.opcodes.OP_TRUE, // Choose IF branch
          redeemScript
        ]));
      } else {
        // Script path: false branch (before deadline)
        scriptSig = Buffer.from(bitcoin.script.compile([
          signatureWithHashType,
          bitcoin.opcodes.OP_FALSE, // Choose ELSE branch
          redeemScript
        ]));
      }

      // Set the input script
      tx.setInputScript(0, scriptSig);

      return {
        txHex: tx.toHex(),
        txId: tx.getId(),
      };
    } catch (error) {
      throw new Error(`Failed to create spending transaction: ${(error as Error).message}`);
    }
  }

  /**
   * Validate and convert a public key to Buffer format
   * @private
   * @param publicKey - Public key to validate
   * @param paramName - Parameter name for error messages
   * @returns Validated public key buffer
   * @throws If public key is invalid
   */
  private _validateAndConvertPublicKey(publicKey: Buffer | string, paramName: string): Buffer {
    if (publicKey === undefined || publicKey === null) {
      throw new Error(`${paramName} cannot be undefined or null`);
    }

    let publicKeyBuffer: Buffer;
    if (typeof publicKey === "string") {
      if (!/^[0-9a-fA-F]+$/.test(publicKey)) {
        throw new Error(
          `${paramName} string must contain only hexadecimal characters`
        );
      }
      try {
        publicKeyBuffer = Buffer.from(publicKey, "hex");
      } catch (error) {
        throw new Error(`Invalid ${paramName} hex string: ${(error as Error).message}`);
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