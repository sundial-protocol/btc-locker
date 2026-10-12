/**
 * @sundial-protocol/btc-runes
 *
 * Bitcoin Runes primitives with no dependencies: the runestone codec (checked
 * against `ord`), rune names and commitments, rune ids, and LEB128 varints.
 *
 * It builds and reads the `OP_RETURN OP_13 <payload>` script of a runestone. It
 * does not build transactions, sign, or look up balances; a package that does
 * (for example `@sundial-protocol/solstice`) puts the script in an output.
 */

// ── Varints ──────────────────────────────────────────────────────────────────
export {
  encodeVarint,
  decodeVarint,
  decodeAllVarints,
  U128_MAX,
  type DecodedVarint,
} from "./varint.js";

// ── Rune names ───────────────────────────────────────────────────────────────
export {
  LARGEST_RUNE_NAME,
  runeNameToNumber,
  numberToRuneName,
  runeCommitment,
  parseSpacedRune,
  formatSpacedRune,
} from "./rune-name.js";

// ── Rune ids ─────────────────────────────────────────────────────────────────
export {
  RUNE_ID_ZERO,
  formatRuneId,
  parseRuneId,
  runeIdEquals,
  compareRuneId,
  runeIdDelta,
  runeIdFromDelta,
  type RuneId,
} from "./rune-id.js";

// ── Runestone data model ─────────────────────────────────────────────────────
export {
  Tag,
  Flag,
  flagMask,
  RUNESTONE_MAGIC,
  MAX_DIVISIBILITY,
  MAX_SPACERS,
  type Flaw,
  type DecipherContext,
  type Terms,
  type Etching,
  type Edict,
  type Runestone,
  type DecipherResult,
} from "./types.js";

// ── Runestone codec ──────────────────────────────────────────────────────────
export type { RunestoneCodec } from "./codec.js";
export { NativeRunestoneCodec, nativeRunestoneCodec } from "./native-codec.js";
export { encipherGuarded, CenotaphError } from "./guard.js";

// ── Script helper ────────────────────────────────────────────────────────────
// Minimal data push, as used for a runestone payload and for the rune-name
// commitment in an etching's tapscript.
export { pushBytes } from "./script.js";
