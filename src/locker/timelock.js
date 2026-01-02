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
   * @async
   * @method createTimelockScript
   * @param {number} locktime - Unix timestamp (for time-based) or block height (for height-based)
   * @param {Buffer|string} publicKey - Public key as buffer or hex string
   * @returns {Promise<Object>} Script details object
   * @returns {Buffer} returns.script - The compiled timelock script
   * @returns {string} returns.scriptHex - Script in hex format
   * @returns {string} returns.address - P2SH address for the script
   * @returns {string} returns.redeemScript - Redeem script in hex format
   * @returns {number} returns.locktime - The locktime value
   * @throws {Error} If locktime or publicKey is invalid
   * @example
   * const timelock = new TimelockManager();
   * const script = await timelock.createTimelockScript(1640995200, publicKey);
   * console.log(script.address);
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
   * Create a relative timelock script (CSV - CheckSequenceVerify)
   * @async
   * @method createRelativeTimelockScript
   * @param {number} sequence - Relative timelock value (blocks or time units)
   * @param {Buffer|string} publicKey - Public key as buffer or hex string
   * @returns {Promise<Object>} Script details object
   * @returns {Buffer} returns.script - The compiled timelock script
   * @returns {string} returns.scriptHex - Script in hex format
   * @returns {string} returns.address - P2SH address for the script
   * @returns {string} returns.redeemScript - Redeem script in hex format
   * @returns {number} returns.sequence - The sequence value
   * @throws {Error} If sequence or publicKey is invalid
   * @example
   * const timelock = new TimelockManager();
   * const script = await timelock.createRelativeTimelockScript(144, publicKey); // 1 day
   * console.log(script.address);
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
