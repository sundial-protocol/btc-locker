/**
 * Cenotaph guard.
 *
 * A cenotaph is a malformed runestone that Bitcoin accepts but Runes indexers
 * treat as a burn: every rune the transaction spends is destroyed. So every
 * runestone should be shown to round-trip through the decoder to a non-cenotaph
 * before the transaction is signed.
 *
 * {@link encipherGuarded} is the one function a builder should use to turn a
 * {@link Runestone} into a scriptPubKey: it enciphers, deciphers, asserts the
 * result is not a cenotaph, and re-enciphers to prove the bytes round-trip
 * exactly. Any deviation throws before a PSBT is ever handed out for signing.
 */

import { bytesEqual } from "./bytes.js";
import type { RunestoneCodec } from "./codec.js";
import type { DecipherContext, Runestone } from "./types.js";

/** Error thrown when a runestone fails the pre-sign cenotaph guard. */
export class CenotaphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CenotaphError";
  }
}

/**
 * Encipher a runestone and prove it round-trips to a non-cenotaph.
 * @param context - pass `outputCount` (the transaction's output count) so the
 * edict-output and pointer rules are checked as well.
 * @returns the validated `OP_RETURN` scriptPubKey.
 * @throws {CenotaphError} if the runestone deciphers to a cenotaph or does not
 * re-encipher to identical bytes.
 */
export function encipherGuarded(
  runestone: Runestone,
  codec: RunestoneCodec,
  context?: DecipherContext,
): Uint8Array {
  const script = codec.encipher(runestone);

  const decoded = codec.decipher(script, context);
  if (decoded.cenotaph) {
    throw new CenotaphError(
      `runestone would be a cenotaph: ${decoded.flaws.join("; ")}`,
    );
  }

  const reencoded = codec.encipher(decoded.runestone);
  if (!bytesEqual(reencoded, script)) {
    throw new CenotaphError(
      "runestone did not round-trip: re-enciphered bytes differ from the original",
    );
  }

  return script;
}
