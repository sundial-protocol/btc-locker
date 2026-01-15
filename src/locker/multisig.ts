/**
 * @fileoverview Multisig timelock script creation functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core.js";
import type { ScriptInfo } from "../types.js";

/**
 * Multisig timelock script management class for M-of-N timelock operations
 * @class MultisigTimelockManager
 */
export class MultisigTimelockManager extends BTCLockerCore {
  /**
   * Create a multisig timelock script
   * @async
   * @param locktime - Unix timestamp or block height for timelock
   * @param m - Required number of signatures (M-of-N multisig)
   * @param publicKeys - Array of public keys (buffers or hex strings)
   * @returns Script details object
   * @throws If parameters are invalid or insufficient public keys provided
   * @example
   * const multisig = new MultisigTimelockManager();
   * const script = await multisig.createMultisigTimelockScript(
   *   1640995200, // locktime
   *   2,           // require 2 signatures
   *   [pubKey1, pubKey2, pubKey3] // 3 total keys
   * );
   * console.log(script.address);
   */
  async createMultisigTimelockScript(locktime: number, m: number, publicKeys: Array<Buffer | string>): Promise<ScriptInfo> {
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
    }).address!;

    return {
      redeemScript: Buffer.from(redeemScript).toString("hex"),
      scriptHash: Buffer.from(scriptHash).toString("hex"),
      address,
      locktime,
      m,
      publicKeys: pubKeyBuffers.map((buf) => buf.toString("hex")),
      type: "multisig-timelock",
    };
  }
}