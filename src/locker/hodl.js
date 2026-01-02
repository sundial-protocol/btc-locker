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
   * Create a HODL script with emergency escape
   * @param {number} locktime - Unix timestamp or block height
   * @param {Buffer|string} ownerPubKey - Owner's public key
   * @param {Buffer|string} penaltyPubKey - Penalty/Emergency public key
   * @returns {Object} Script details
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
