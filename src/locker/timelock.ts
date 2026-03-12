/**
 * @fileoverview Timelock script management — thin facade over ./scripts/timelock
 */

import { BTCLockerCore } from "./core";
import { createTimelockScript, createRelativeTimelockScript } from "./scripts";
import type { ScriptInfo } from "../types";

/**
 * Timelock script management class for creating time-locked Bitcoin scripts
 * @class TimelockManager
 */
export class TimelockManager extends BTCLockerCore {
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
}
