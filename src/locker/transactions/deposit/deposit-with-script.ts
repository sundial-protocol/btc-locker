import type { LockerContext } from "../../core.js";
import { createDepositTransaction, DepositParams } from "./deposit.js";
import { DepositResult, ScriptInfo } from "../../../index.js";

/**
 * Parameters for Dawn staking with script data
 * @interface DepositWithScriptParams
 * @description Configuration for creating Dawn staking transactions with provided timelock script information
 * @extends Omit<DepositParams, 'timelockAddress'>
 */
export interface DepositWithScriptParams extends Omit<
  DepositParams,
  "timelockAddress"
> {
  /** Timelock script information object */
  timelockScript: ScriptInfo;
}

/**
 * Result of Dawn staking transaction with script information
 * @interface DepositWithScriptResult
 * @description Dawn staking transaction result with additional timelock script details
 * @extends DepositResult
 */
export interface DepositWithScriptResult extends DepositResult {
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

export async function createDepositTransactionWithScript(
  ctx: LockerContext,
  params: DepositWithScriptParams,
): Promise<string> {
  const { timelockScript, ...otherParams } = params;

  if (!timelockScript || typeof timelockScript !== "object") {
    throw new Error("timelockScript must be a valid script object");
  }

  if (!timelockScript.address) {
    throw new Error("timelockScript must have an address property");
  }

  const txParams: DepositParams = {
    ...otherParams,
    timelockAddress: timelockScript.address,
  };

  return await createDepositTransaction(ctx, txParams);
}
