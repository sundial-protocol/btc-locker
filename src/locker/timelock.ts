/**
 * @fileoverview Timelock script creation functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core";
import { ScriptUtils, KeyUtils, ValidationUtils } from "../utils";
import { SUNDIAL_NAMESPACE_XONLY, TAPROOT_LEAF_VERSION } from "../utils/scripts";
import type { ScriptInfo } from "../types";

/**
 * Timelock script management class for creating time-locked Bitcoin scripts
 * @class TimelockManager
 */
export class TimelockManager extends BTCLockerCore {
  /**
   * Create a simple timelock script (absolute time) wrapped in Taproot P2TR
   * @async
   * @param locktime - Unix timestamp (for time-based) or block height (for height-based)
   * @param publicKey - Public key as buffer or hex string
   * @returns Script details object with Taproot spend info
   * @throws If locktime or publicKey is invalid
   * @example
   * const timelock = new TimelockManager();
   * const script = await timelock.createTimelockScript(1640995200, publicKey);
   * console.log(script.address); // bc1p... or tb1p... Taproot address
   */
  async createTimelockScript(locktime: number, publicKey: Buffer | string): Promise<ScriptInfo> {
    await this.ensureInitialized();

    // Validate inputs using shared utilities
    const locktimeNumber = ValidationUtils.validateLocktime(locktime);
    const publicKeyBuffer = KeyUtils.validateAndConvertPublicKey(publicKey);

    try {
      const redeemScript = bitcoin.script.compile([
        bitcoin.script.number.encode(locktimeNumber),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        publicKeyBuffer,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);

      const scriptHash = ScriptUtils.calculateScriptHash(Buffer.from(redeemScript));
      const spendInfo = ScriptUtils.deriveTaprootSpendInfo(
        Buffer.from(redeemScript),
        this.network,
      );

      return {
        redeemScript: Buffer.from(redeemScript).toString("hex"),
        scriptHash,
        address: spendInfo.address,
        outputScript: spendInfo.outputScript.toString("hex"),
        controlBlock: spendInfo.controlBlock.toString("hex"),
        internalPubkey: SUNDIAL_NAMESPACE_XONLY.toString("hex"),
        leafVersion: TAPROOT_LEAF_VERSION,
        locktime: locktimeNumber,
        publicKey: publicKeyBuffer.toString("hex"),
        type: "timelock",
      };
    } catch (error) {
      throw new Error(`Failed to create timelock script: ${(error as Error).message}`);
    }
  }

  /**
   * Create a relative timelock script (CSV - CheckSequenceVerify) wrapped in Taproot P2TR
   * @async
   * @param sequence - Relative timelock value (blocks or time units)
   * @param publicKey - Public key as buffer or hex string
   * @returns Script details object with Taproot spend info
   * @throws If sequence or publicKey is invalid
   * @example
   * const timelock = new TimelockManager();
   * const script = await timelock.createRelativeTimelockScript(144, publicKey); // 1 day
   * console.log(script.address); // bc1p... or tb1p... Taproot address
   */
  async createRelativeTimelockScript(sequence: number, publicKey: Buffer | string): Promise<ScriptInfo> {
    await this.ensureInitialized();

    // Validate public key using shared utility
    const publicKeyBuffer = KeyUtils.validateAndConvertPublicKey(publicKey);

    const redeemScript = bitcoin.script.compile([
      bitcoin.script.number.encode(sequence),
      bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
      bitcoin.opcodes.OP_DROP,
      publicKeyBuffer,
      bitcoin.opcodes.OP_CHECKSIG,
    ]);

    const scriptHash = ScriptUtils.calculateScriptHash(Buffer.from(redeemScript));
    const spendInfo = ScriptUtils.deriveTaprootSpendInfo(
      Buffer.from(redeemScript),
      this.network,
    );

    return {
      redeemScript: Buffer.from(redeemScript).toString("hex"),
      scriptHash,
      address: spendInfo.address,
      outputScript: spendInfo.outputScript.toString("hex"),
      controlBlock: spendInfo.controlBlock.toString("hex"),
      internalPubkey: SUNDIAL_NAMESPACE_XONLY.toString("hex"),
      leafVersion: TAPROOT_LEAF_VERSION,
      sequence,
      publicKey: publicKeyBuffer.toString("hex"),
      type: "relative-timelock",
    };
  }
}