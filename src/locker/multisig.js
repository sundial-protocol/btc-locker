/**
 * @fileoverview Multisig timelock script functionality
 * @module locker/multisig
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core.js";

/**
 * Multisig timelock script management class for M-of-N timelock operations
 * @class MultisigTimelockManager
 * @extends BTCLockerCore
 */
export class MultisigTimelockManager extends BTCLockerCore {
  /**
   * Create a multisig timelock script
   * @param {number} locktime - Unix timestamp or block height
   * @param {number} m - Required signatures
   * @param {Array} publicKeys - Array of public key buffers or hex strings
   * @returns {Object} Script details
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
