/**
 * @fileoverview Escrow script creation functions
 */

import * as bitcoin from "bitcoinjs-lib";
import type { LockerContext } from "../core.js";
import { assert } from "../../errors.js";
import { KeyUtils, ValidationUtils, ScriptUtils } from "../../utils/index.js";
import type { ScriptInfo } from "../../types.js";

export async function createEscrowScript(
  ctx: LockerContext,
  deadline: number,
  beforePublicKey: Buffer | string,
  afterPublicKey: Buffer | string,
): Promise<ScriptInfo> {
  const deadlineNumber = ValidationUtils.validateLocktime(deadline, "deadline");
  const beforePubKeyBuffer = KeyUtils.validateAndConvertPublicKey(
    beforePublicKey,
    "beforePublicKey",
  );
  const afterPubKeyBuffer = KeyUtils.validateAndConvertPublicKey(
    afterPublicKey,
    "afterPublicKey",
  );

  assert(
    !beforePubKeyBuffer.equals(afterPubKeyBuffer),
    "beforePublicKey and afterPublicKey must be different",
  );

  try {
    const redeemScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_IF,
      bitcoin.script.number.encode(deadlineNumber),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      afterPubKeyBuffer,
      bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ELSE,
      beforePubKeyBuffer,
      bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ENDIF,
    ]);

    const scriptHash = ScriptUtils.calculateScriptHash(
      Buffer.from(redeemScript),
    );
    const address = ScriptUtils.createScriptAddress(
      Buffer.from(redeemScript),
      ctx.network,
    );

    return {
      redeemScript: Buffer.from(redeemScript).toString("hex"),
      scriptHash,
      address,
      type: "time-escrow",
      locktime: deadlineNumber,
      beforePublicKey: beforePubKeyBuffer.toString("hex"),
      afterPublicKey: afterPubKeyBuffer.toString("hex"),
    };
  } catch (error) {
    throw new Error(
      `Failed to create escrow script: ${(error as Error).message}`,
    );
  }
}
