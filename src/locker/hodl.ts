/**
 * @fileoverview HODL script creation functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core";
import { ScriptUtils, KeyUtils, ValidationUtils } from "../utils";
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

    // Validate inputs using shared utilities
    const locktimeNumber = ValidationUtils.validateLocktime(locktime);
    const ownerPubKeyBuffer = KeyUtils.validateAndConvertPublicKey(ownerPubKey, "ownerPubKey");
    const penaltyPubKeyBuffer = KeyUtils.validateAndConvertPublicKey(penaltyPubKey, "penaltyPubKey");

    const redeemScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_IF,
      bitcoin.script.number.encode(locktimeNumber),
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

    const scriptHash = ScriptUtils.calculateScriptHash(Buffer.from(redeemScript));
    const address = ScriptUtils.createScriptAddress(Buffer.from(redeemScript), this.network);

    return {
      redeemScript: Buffer.from(redeemScript).toString("hex"),
      scriptHash,
      address,
      locktime: locktimeNumber,
      ownerPubKey: ownerPubKeyBuffer.toString("hex"),
      penaltyPubKey: penaltyPubKeyBuffer.toString("hex"),
      type: "hodl",
    };
  }
}