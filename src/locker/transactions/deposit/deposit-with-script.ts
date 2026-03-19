import type { LockerContext } from "../../core.js";
import { assertAll } from "../../../errors.js";
import { createDepositTransaction, DepositParams } from "./deposit.js";
import { ScriptInfo } from "../../../index.js";

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

export async function createDepositTransactionWithScript(
  ctx: LockerContext,
  params: DepositWithScriptParams,
): Promise<string> {
  const { timelockScript, ...otherParams } = params;

  assertAll([
    [
      !!timelockScript && typeof timelockScript === "object",
      "timelockScript must be a valid script object",
    ],
    [
      typeof timelockScript?.address === "string",
      "timelockScript must have an address property",
    ],
  ]);

  const txParams: DepositParams = {
    ...otherParams,
    timelockAddress: timelockScript.address,
  };

  return await createDepositTransaction(ctx, txParams);
}
