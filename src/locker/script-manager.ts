/**
 * @fileoverview Thin facade over per-file script creation functions
 * @description Each script type lives in its own file under ./scripts/.
 * This class delegates to those functions, passing itself as the shared context.
 */

import { BTCLockerCore } from "./core";
import {
  createTimelockScript,
  createRelativeTimelockScript,
  createEscrowScript,
} from "./scripts";
import type { ScriptInfo } from "../types";

/**
 * Unified script manager for all btc-locker script creation types
 * @class ScriptManager
 * @extends BTCLockerCore
 */
export class ScriptManager extends BTCLockerCore {
  async createTimelockScript(
    locktime: number,
    publicKey: Buffer | string,
  ): Promise<ScriptInfo> {
    await this.ensureInitialized();
    return createTimelockScript(this, locktime, publicKey);
  }

  async createRelativeTimelockScript(
    sequence: number,
    publicKey: Buffer | string,
  ): Promise<ScriptInfo> {
    await this.ensureInitialized();
    return createRelativeTimelockScript(this, sequence, publicKey);
  }

  async createEscrowScript(
    deadline: number,
    beforePublicKey: Buffer | string,
    afterPublicKey: Buffer | string,
  ): Promise<ScriptInfo> {
    await this.ensureInitialized();
    return createEscrowScript(this, deadline, beforePublicKey, afterPublicKey);
  }
}
