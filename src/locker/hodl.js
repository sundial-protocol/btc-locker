/**
 * @fileoverview HODL script functionality
 * @module locker/hodl
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core.js";

/**
 * HODL script creation class for creating emergency escape mechanisms
 * @class HodlScriptCreator
 * @extends BTCLockerCore
 */
export class HodlScriptCreator extends BTCLockerCore {
  /**
   * Create a HODL script with emergency escape mechanism
   * @async
   * @method createHodlScript
   * @param {number} locktime - Unix timestamp or block height for the HODL period
   * @param {Buffer|string} ownerPubKey - Owner's public key (normal spending after locktime)
   * @param {Buffer|string} penaltyPubKey - Emergency escape public key (immediate spending)
   * @returns {Promise<Object>} Script details object
   * @returns {Buffer} returns.script - The compiled HODL script with conditional logic
   * @returns {string} returns.scriptHex - Script in hex format
   * @returns {string} returns.address - P2SH address for the script
   * @returns {string} returns.redeemScript - Redeem script in hex format
   * @returns {number} returns.locktime - The locktime value
   * @returns {string} returns.ownerPubKey - Owner public key in hex
   * @returns {string} returns.penaltyPubKey - Penalty public key in hex
   * @throws {Error} If parameters are invalid
   * @example
   * const hodl = new HodlScriptCreator();
   * const script = await hodl.createHodlScript(
   *   1640995200,    // locktime
   *   ownerPubKey,   // normal spending key
   *   escapePubKey   // emergency escape key
   * );
   * console.log(script.address);
   */
  async createHodlScript(locktime, ownerPubKey, penaltyPubKey) {
    await this.ensureInitialized();

    if (typeof ownerPubKey === "string") {
      ownerPubKey = Buffer.from(ownerPubKey, "hex");
    }
    if (typeof penaltyPubKey === "string") {
      penaltyPubKey = Buffer.from(penaltyPubKey, "hex");
    }

    const redeemScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_IF,
      bitcoin.script.number.encode(locktime),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      ownerPubKey,
      bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ELSE,
      bitcoin.script.number.encode(2),
      ownerPubKey,
      penaltyPubKey,
      bitcoin.script.number.encode(2),
      bitcoin.opcodes.OP_CHECKMULTISIG,
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
      locktime,
      ownerPubKey: ownerPubKey.toString("hex"),
      penaltyPubKey: penaltyPubKey.toString("hex"),
      type: "hodl",
    };
  }
}
