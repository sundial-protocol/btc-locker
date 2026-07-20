/**
 * Cenotaph guard.
 *
 * The Solstice Runes decision record mandates: "validate every runestone we build
 * round-trips through the decoder to a non-cenotaph before signing." A cenotaph is
 * a malformed runestone that Bitcoin will accept but Runes indexers will treat as
 * a burn — for Solstice that means silently destroying receipt-token supply, which
 * the accounting-integrity invariant must never allow.
 *
 * {@link encipherGuarded} is the single choke point every builder uses to turn a
 * {@link Runestone} into a scriptPubKey: it enciphers, deciphers, asserts the
 * result is not a cenotaph, and re-enciphers to prove the bytes round-trip
 * exactly. Any deviation throws before a PSBT is ever handed out for signing.
 */

import type { RunestoneCodec } from "./codec.js";
import type { Runestone } from "./types.js";

/** Error thrown when a runestone fails the pre-sign cenotaph guard. */
export class CenotaphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CenotaphError";
  }
}

/**
 * Encipher a runestone and prove it round-trips to a non-cenotaph.
 * @returns the validated `OP_RETURN` scriptPubKey.
 * @throws {CenotaphError} if the runestone deciphers to a cenotaph or does not
 * re-encipher to identical bytes.
 */
export function encipherGuarded(
  runestone: Runestone,
  codec: RunestoneCodec,
): Buffer {
  const script = codec.encipher(runestone);

  const decoded = codec.decipher(script);
  if (decoded.cenotaph) {
    throw new CenotaphError(
      `runestone would be a cenotaph: ${decoded.flaws.join("; ")}`,
    );
  }

  const reencoded = codec.encipher(decoded.runestone);
  if (!reencoded.equals(script)) {
    throw new CenotaphError(
      "runestone did not round-trip: re-enciphered bytes differ from the original",
    );
  }

  return script;
}
