/**
 * @fileoverview Timelock script creation functionality
 * @module locker/timelock
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core.js";

/**
 * Timelock script management class for creating time-locked Bitcoin scripts
 * @class TimelockManager
 * @extends BTCLockerCore
 */
export class TimelockManager extends BTCLockerCore {
  /**
   * Create a simple timelock script (absolute time)
   * @param {number} locktime - Unix timestamp or block height
   * @param {Buffer|string} publicKey - Public key buffer or hex string
   * @returns {Object} Script details
   */
  async createTimelockScript(locktime, publicKey) {
    await this.ensureInitialized();

    // Validate inputs
    if (locktime === undefined || locktime === null) {
      throw new Error("locktime cannot be undefined or null");
    }

    if (publicKey === undefined || publicKey === null) {
      throw new Error("publicKey cannot be undefined or null");
    }

    // Convert and validate public key
    let publicKeyBuffer;
    if (typeof publicKey === "string") {
      if (!/^[0-9a-fA-F]+$/.test(publicKey)) {
        throw new Error(
          "publicKey string must contain only hexadecimal characters"
        );
      }
      try {
        publicKeyBuffer = Buffer.from(publicKey, "hex");
      } catch (error) {
        throw new Error(`Invalid public key hex string: ${error.message}`);
      }
    } else if (Buffer.isBuffer(publicKey)) {
      publicKeyBuffer = publicKey;
    } else {
      throw new Error("publicKey must be a string or Buffer");
    }

    // Validate public key length
    if (publicKeyBuffer.length !== 33 && publicKeyBuffer.length !== 65) {
      throw new Error(
        `Invalid public key length: ${publicKeyBuffer.length}. Expected 33 (compressed) or 65 (uncompressed) bytes`
      );
    }

    // Validate locktime
    const locktimeNumber = Number(locktime);
    if (!Number.isInteger(locktimeNumber) || locktimeNumber < 0) {
      throw new Error("locktime must be a non-negative integer");
    }

    try {
      const redeemScript = bitcoin.script.compile([
        bitcoin.script.number.encode(locktimeNumber),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        publicKeyBuffer,
        bitcoin.opcodes.OP_CHECKSIG,
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
        locktime: locktimeNumber,
        publicKey: publicKeyBuffer.toString("hex"),
        type: "timelock",
      };
    } catch (error) {
      throw new Error(`Failed to create timelock script: ${error.message}`);
    }
  }

  /**
   * Create a relative timelock script
   * @param {number} sequence - Relative locktime in blocks
   * @param {Buffer|string} publicKey - Public key buffer or hex string
   * @returns {Object} Script details
   */
  async createRelativeTimelockScript(sequence, publicKey) {
    await this.ensureInitialized();

    if (typeof publicKey === "string") {
      publicKey = Buffer.from(publicKey, "hex");
    }

    const redeemScript = bitcoin.script.compile([
      bitcoin.script.number.encode(sequence),
      bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
      bitcoin.opcodes.OP_DROP,
      publicKey,
      bitcoin.opcodes.OP_CHECKSIG,
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
      sequence,
      publicKey: publicKey.toString("hex"),
      type: "relative-timelock",
    };
  }
}
