/**
 * {@link RunestoneCodec} is the interface between transaction builders and the
 * runestone encoder/decoder.
 *
 * Builders should depend on this interface and not on a concrete class, so
 * another implementation can be passed in without changing them.
 * {@link NativeRunestoneCodec} is the implementation this package ships; its doc
 * comment lists its scope and limits.
 */

import type { DecipherContext, DecipherResult, Runestone } from "./types.js";

export interface RunestoneCodec {
  /** Encode a runestone to its `OP_RETURN` scriptPubKey. */
  encipher(runestone: Runestone): Uint8Array;
  /** Decode a scriptPubKey to a runestone, flagging cenotaphs. */
  decipher(scriptPubKey: Uint8Array, context?: DecipherContext): DecipherResult;
}
