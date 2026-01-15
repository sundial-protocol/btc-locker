/**
 * @fileoverview Timelock script creation functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core.js";
import type { ScriptInfo } from "../types.js";

/**
 * Timelock script management class for creating time-locked Bitcoin scripts
 * @class TimelockManager
 */
export class TimelockManager extends BTCLockerCore {
  /**
   * Create a simple timelock script (absolute time)
   * @async
   * @param locktime - Unix timestamp (for time-based) or block height (for height-based)
   * @param publicKey - Public key as buffer or hex string
   * @returns Script details object
   * @throws If locktime or publicKey is invalid
   * @example
   * const timelock = new TimelockManager();
   * const script = await timelock.createTimelockScript(1640995200, publicKey);
   * console.log(script.address);
   */
  async createTimelockScript(locktime: number, publicKey: Buffer | string): Promise<ScriptInfo> {
    await this.ensureInitialized();

    // Validate inputs
    if (locktime === undefined || locktime === null) {
      throw new Error("locktime cannot be undefined or null");
    }

    if (publicKey === undefined || publicKey === null) {
      throw new Error("publicKey cannot be undefined or null");
    }

    // Convert and validate public key
    let publicKeyBuffer: Buffer;
    if (typeof publicKey === "string") {
      if (!/^[0-9a-fA-F]+$/.test(publicKey)) {
        throw new Error(
          "publicKey string must contain only hexadecimal characters"
        );
      }
      try {
        publicKeyBuffer = Buffer.from(publicKey, "hex");
      } catch (error) {
        throw new Error(`Invalid public key hex string: ${(error as Error).message}`);
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
      }).address!;

      return {
        redeemScript: Buffer.from(redeemScript).toString("hex"),
        scriptHash: Buffer.from(scriptHash).toString("hex"),
        address,
        locktime: locktimeNumber,
        publicKey: publicKeyBuffer.toString("hex"),
        type: "timelock",
      };
    } catch (error) {
      throw new Error(`Failed to create timelock script: ${(error as Error).message}`);
    }
  }

  /**
   * Create a relative timelock script (CSV - CheckSequenceVerify)
   * @async
   * @param sequence - Relative timelock value (blocks or time units)
   * @param publicKey - Public key as buffer or hex string
   * @returns Script details object
   * @throws If sequence or publicKey is invalid
   * @example
   * const timelock = new TimelockManager();
   * const script = await timelock.createRelativeTimelockScript(144, publicKey); // 1 day
   * console.log(script.address);
   */
  async createRelativeTimelockScript(sequence: number, publicKey: Buffer | string): Promise<ScriptInfo> {
    await this.ensureInitialized();

    let publicKeyBuffer: Buffer;
    if (typeof publicKey === "string") {
      publicKeyBuffer = Buffer.from(publicKey, "hex");
    } else {
      publicKeyBuffer = publicKey;
    }

    const redeemScript = bitcoin.script.compile([
      bitcoin.script.number.encode(sequence),
      bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
      bitcoin.opcodes.OP_DROP,
      publicKeyBuffer,
      bitcoin.opcodes.OP_CHECKSIG,
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
      sequence,
      publicKey: publicKeyBuffer.toString("hex"),
      type: "relative-timelock",
    };
  }
}