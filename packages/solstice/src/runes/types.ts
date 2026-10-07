/**
 * Runestone data model and wire constants.
 *
 * A runestone is carried in a single `OP_RETURN OP_13 <payload>` output. The
 * payload is a stream of LEB128 varints decoded as tag/value pairs, plus a Body
 * section (tag 0) holding delta-encoded edicts. See the Runes spec for the full
 * grammar; Solstice only needs the Etching and Edict subsets.
 */

import type { RuneId } from "./rune-id.js";

/** The magic opcode following `OP_RETURN` in every runestone (`OP_PUSHNUM_13`). */
export const RUNESTONE_MAGIC = 0x5d; // OP_13

/**
 * Runestone field tags. Even tags are recognized fields; unrecognized even tags
 * make a runestone a cenotaph. Odd tags are ignored if unrecognized.
 */
export enum Tag {
  Body = 0,
  Flags = 2,
  Rune = 4,
  Premine = 6,
  Cap = 8,
  Amount = 10,
  HeightStart = 12,
  HeightEnd = 14,
  OffsetStart = 16,
  OffsetEnd = 18,
  Mint = 20,
  Pointer = 22,
  Divisibility = 1,
  Spacers = 3,
  Symbol = 5,
}

/** Largest divisibility ord accepts in an etching. */
export const MAX_DIVISIBILITY = 38;

/** Largest spacer bitmask ord accepts: one bit per gap in a 28-letter name. */
export const MAX_SPACERS = 0b0000_0111_1111_1111_1111_1111_1111_1111;

/** Bit positions within the {@link Tag.Flags} value. */
export enum Flag {
  /** Set when the runestone etches a new rune. */
  Etching = 0,
  /** Set when the etching opens a mint (has {@link Terms}). */
  Terms = 1,
  /** Set to opt the rune into future protocol upgrades. */
  Turbo = 2,
}

/** Convert a {@link Flag} to its bitmask value. */
export function flagMask(flag: Flag): bigint {
  return 1n << BigInt(flag);
}

/** Open-mint terms. Solstice premines the full supply and sets no terms. */
export interface Terms {
  amount?: bigint;
  cap?: bigint;
  heightStart?: bigint;
  heightEnd?: bigint;
  offsetStart?: bigint;
  offsetEnd?: bigint;
}

/** Etching parameters (the C0 launch runestone). */
export interface Etching {
  /** Rune name as a `u128` number (see rune-name codec). */
  rune?: bigint;
  /** Decimal places, 0–38. */
  divisibility?: number;
  /** Spacer bitmask for display (`•` placement). */
  spacers?: number;
  /** Single display glyph, as a Unicode code point. */
  symbol?: number;
  /** Amount minted to the etcher at etch time (the Solstice premine). */
  premine?: bigint;
  /** Open-mint terms; omitted for a closed, fully-premined supply. */
  terms?: Terms;
  /** Opt into future protocol upgrades. */
  turbo?: boolean;
}

/** A single rune transfer: move `amount` of rune `id` to output index `output`. */
export interface Edict {
  id: RuneId;
  amount: bigint;
  output: number;
}

/** A decoded/encodable runestone. */
export interface Runestone {
  etching?: Etching;
  edicts?: Edict[];
  mint?: RuneId;
  /** Output index that receives runes not otherwise allocated by edicts. */
  pointer?: number;
}

/**
 * Why a runestone is a cenotaph. The names are ord's (`ordinals::Flaw`,
 * serialized in kebab-case).
 */
export type Flaw =
  | "edict-output"
  | "edict-rune-id"
  | "invalid-script"
  | "opcode"
  | "supply-overflow"
  | "trailing-integers"
  | "truncated-field"
  | "unrecognized-even-tag"
  | "unrecognized-flag"
  | "varint";

/** What the decoder may know about the transaction around the scriptPubKey. */
export interface DecipherContext {
  /**
   * Number of outputs in the transaction. Two cenotaph rules need it: an edict
   * output above it, and a pointer at or above it. They are skipped when it is
   * not given.
   */
  outputCount?: number;
}

/** Result of deciphering a scriptPubKey. */
export interface DecipherResult {
  /** The decoded runestone, present even for cenotaphs (best-effort). */
  runestone: Runestone;
  /**
   * True when ord would treat the runestone as a cenotaph, and also when the
   * script is not a runestone at all (then `flaw` is undefined).
   */
  cenotaph: boolean;
  /** The flaw ord would report: the first one found, in ord's order. */
  flaw?: Flaw;
  /** Human-readable reasons the runestone was flagged a cenotaph. */
  flaws: string[];
}
