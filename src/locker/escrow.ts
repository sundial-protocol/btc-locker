/**
 * @fileoverview Escrow script management — thin facade over ./scripts/escrow
 */

import { BTCLockerCore } from "./core";
import { createEscrowScript } from "./scripts";
import type { ScriptInfo } from "../types";

/**
 * Time-based escrow script management class
 * @class EscrowManager
 */
export class EscrowManager extends BTCLockerCore {
  /**
   * Create a time-based escrow script
   * @async
   * @param deadline - Unix timestamp deadline
   * @param beforePublicKey - Public key of user who can withdraw before deadline
   * @param afterPublicKey - Public key of user who can withdraw after deadline
   * @returns Script details object
   * @throws If deadline or public keys are invalid
   * @example
   * const escrow = new EscrowManager();
   * const script = await escrow.createEscrowScript(
   *   1640995200,
   *   userAPublicKey,
   *   userBPublicKey
   * );
   * console.log(script.address);
   */
  async createEscrowScript(
    deadline: number,
    beforePublicKey: Buffer | string,
    afterPublicKey: Buffer | string,
  ): Promise<ScriptInfo> {
    await this.ensureInitialized();
    return createEscrowScript(this, deadline, beforePublicKey, afterPublicKey);
  }
}
