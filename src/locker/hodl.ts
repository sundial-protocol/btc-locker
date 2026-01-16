/**
 * @fileoverview HODL script creation functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core";
import type { ScriptInfo } from "../types";

/**
 * HODL script creation class with emergency escape mechanisms
 * @class HodlScriptCreator
 */
export class HodlScriptCreator extends BTCLockerCore {
  /**
   * Create a HODL script with emergency escape mechanism
   * @async
   * @param locktime - Unix timestamp or block height for the HODL period
   * @param ownerPubKey - Owner's public key (normal spending after locktime)
   * @param penaltyPubKey - Emergency escape public key (immediate spending)
   * @returns Script details object
   * @throws If parameters are invalid
   * @example
   * const hodl = new HodlScriptCreator();
   * const script = await hodl.createHodlScript(
   *   1640995200,    // locktime
   *   ownerPubKey,   // normal spending key
   *   escapePubKey   // emergency escape key
   * );
   * console.log(script.address);
   */
  async createHodlScript(locktime: number, ownerPubKey: Buffer | string, penaltyPubKey: Buffer | string): Promise<ScriptInfo> {
    await this.ensureInitialized();

    let ownerPubKeyBuffer: Buffer;
    let penaltyPubKeyBuffer: Buffer;

    if (typeof ownerPubKey === "string") {
      ownerPubKeyBuffer = Buffer.from(ownerPubKey, "hex");
    } else {
      ownerPubKeyBuffer = ownerPubKey;
    }

    if (typeof penaltyPubKey === "string") {
      penaltyPubKeyBuffer = Buffer.from(penaltyPubKey, "hex");
    } else {
      penaltyPubKeyBuffer = penaltyPubKey;
    }

    const redeemScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_IF,
      bitcoin.script.number.encode(locktime),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      ownerPubKeyBuffer,
      bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ELSE,
      bitcoin.script.number.encode(2),
      ownerPubKeyBuffer,
      penaltyPubKeyBuffer,
      bitcoin.script.number.encode(2),
      bitcoin.opcodes.OP_CHECKMULTISIG,
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
      locktime,
      ownerPubKey: ownerPubKeyBuffer.toString("hex"),
      penaltyPubKey: penaltyPubKeyBuffer.toString("hex"),
      type: "hodl",
    };
  }
}