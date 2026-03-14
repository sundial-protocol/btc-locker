/**
 * @fileoverview Timelock script creation functions
 */

import * as bitcoin from "bitcoinjs-lib";
import type { LockerContext } from "../core.js";
import { ScriptUtils, KeyUtils, ValidationUtils } from "../../utils/index.js";
import type { ScriptInfo } from "../../types.js";

export async function createTimelockScript(
  ctx: LockerContext,
  locktime: number,
  publicKey: Buffer | string,
): Promise<ScriptInfo> {
  const locktimeNumber = ValidationUtils.validateLocktime(locktime);
  const publicKeyBuffer = KeyUtils.validateAndConvertPublicKey(publicKey);

  try {
    const redeemScript = bitcoin.script.compile([
      bitcoin.script.number.encode(locktimeNumber),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      publicKeyBuffer,
      bitcoin.opcodes.OP_CHECKSIG,
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
      locktime: locktimeNumber,
      publicKey: publicKeyBuffer.toString("hex"),
      type: "timelock",
    };
  } catch (error) {
    throw new Error(
      `Failed to create timelock script: ${(error as Error).message}`,
    );
  }
}

export async function createRelativeTimelockScript(
  ctx: LockerContext,
  sequence: number,
  publicKey: Buffer | string,
): Promise<ScriptInfo> {
  const publicKeyBuffer = KeyUtils.validateAndConvertPublicKey(publicKey);

  const redeemScript = bitcoin.script.compile([
    bitcoin.script.number.encode(sequence),
    bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
    bitcoin.opcodes.OP_DROP,
    publicKeyBuffer,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);

  const scriptHash = ScriptUtils.calculateScriptHash(Buffer.from(redeemScript));
  const address = ScriptUtils.createScriptAddress(
    Buffer.from(redeemScript),
    ctx.network,
  );

  return {
    redeemScript: Buffer.from(redeemScript).toString("hex"),
    scriptHash,
    address,
    sequence,
    publicKey: publicKeyBuffer.toString("hex"),
    type: "relative-timelock",
  };
}
