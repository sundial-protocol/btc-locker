/**
 * {@link RunestoneCodec} — the pluggable seam between Solstice's transaction
 * builders and the concrete runestone encoder/decoder.
 *
 * Solstice's Runes decision record leaves the production encode/decode library an
 * open item (`@magiceden-oss/runestone-lib` vs `runelib`, pending a security /
 * maintenance review). Every builder in this package depends only on this
 * interface, never on a concrete implementation, so the reviewed library can be
 * dropped in later by providing an adapter that satisfies `RunestoneCodec` —
 * without touching any caller.
 *
 * A {@link NativeRunestoneCodec} is provided so the rest of the package is
 * functional and testable today. See its doc comment for scope/limitations.
 */

import type { DecipherResult, Runestone } from "./types.js";

export interface RunestoneCodec {
  /** Encode a runestone to its `OP_RETURN` scriptPubKey. */
  encipher(runestone: Runestone): Buffer;
  /** Decode a scriptPubKey to a runestone, flagging cenotaphs. */
  decipher(scriptPubKey: Buffer): DecipherResult;
}
