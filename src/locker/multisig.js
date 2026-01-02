/**
 * @fileoverview Multisig timelock script creation functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core.js";

/**
 * Multisig timelock script management class for M-of-N timelock operations
 * @class MultisigTimelockManager
 */
export class MultisigTimelockManager extends BTCLockerCore {
  /**
   * Create a multisig timelock script
   * @async
   * @param {number} locktime - Unix timestamp or block height for timelock
   * @param {number} m - Required number of signatures (M-of-N multisig)
   * @param {Array<Buffer|string>} publicKeys - Array of public keys (buffers or hex strings)
   * @returns {Promise<Object>} Script details object
   * @returns {Buffer} returns.script - The compiled multisig timelock script
   * @returns {string} returns.scriptHex - Script in hex format
   * @returns {string} returns.address - P2SH address for the script
   * @returns {string} returns.redeemScript - Redeem script in hex format
   * @returns {number} returns.locktime - The locktime value
   * @returns {number} returns.m - Required signatures count
   * @returns {number} returns.n - Total public keys count
   * @throws {Error} If parameters are invalid or insufficient public keys provided
   * @example
   * const multisig = new MultisigTimelockManager();
   * const script = await multisig.createMultisigTimelockScript(
   *   1640995200, // locktime
   *   2,           // require 2 signatures
   *   [pubKey1, pubKey2, pubKey3] // 3 total keys
   * );
   * console.log(script.address);
   */
  async createMultisigTimelockScript(locktime, m, publicKeys) {
    await this.ensureInitialized();

    const pubKeyBuffers = publicKeys.map((key) =>
      typeof key === "string" ? Buffer.from(key, "hex") : key
    );

    const redeemScript = bitcoin.script.compile([
      bitcoin.script.number.encode(locktime),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      bitcoin.script.number.encode(m),
      ...pubKeyBuffers,
      bitcoin.script.number.encode(publicKeys.length),
      bitcoin.opcodes.OP_CHECKMULTISIG,
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
      m,
      publicKeys: pubKeyBuffers.map((buf) => buf.toString("hex")),
      type: "multisig-timelock",
    };
  }
}
