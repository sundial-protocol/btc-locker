import type { LockerContext } from "../../core";
import { createDawnStakingTransaction, DawnStakingParams } from "./stake";
import { DawnStakingResult, ScriptInfo } from "../../..";

/**
 * Parameters for Dawn staking with script data
 * @interface DawnStakingWithScriptParams
 * @description Configuration for creating Dawn staking transactions with provided timelock script information
 * @extends Omit<DawnStakingParams, 'timelockAddress'>
 */
export interface DawnStakingWithScriptParams extends Omit<
  DawnStakingParams,
  "timelockAddress"
> {
  /** Timelock script information object */
  timelockScript: ScriptInfo;
}

/**
 * Result of Dawn staking transaction with script information
 * @interface DawnStakingWithScriptResult
 * @description Dawn staking transaction result with additional timelock script details
 * @extends DawnStakingResult
 */
export interface DawnStakingWithScriptResult extends DawnStakingResult {
  /** Timelock script details */
  timelockScript: {
    /** Timelock script address */
    address: string;
    /** Script type */
    type: string;
    /** Optional locktime value */
    locktime?: number;
  };
}

export async function createDawnStakingTransactionWithScript(
  ctx: LockerContext,
  params: DawnStakingWithScriptParams,
): Promise<string> {
  const { timelockScript, ...otherParams } = params;

  if (!timelockScript || typeof timelockScript !== "object") {
    throw new Error("timelockScript must be a valid script object");
  }

  if (!timelockScript.address) {
    throw new Error("timelockScript must have an address property");
  }

  const txParams: DawnStakingParams = {
    ...otherParams,
    timelockAddress: timelockScript.address,
  };

  return await createDawnStakingTransaction(ctx, txParams);
}
