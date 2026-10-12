/**
 * LEB128 variable-length integers over `u128`, as used by the Runes protocol.
 *
 * Runes encodes every field of a runestone (tags, values, edict components) as a
 * base-128 LEB128 integer, little-endian, with the high bit of each byte marking
 * continuation. All values are unsigned and bounded by `u128::MAX`.
 *
 * These functions operate on `bigint` so the full u128 range is representable.
 */

/** Largest value representable as a Runes varint (`u128::MAX`). */
export const U128_MAX = (1n << 128n) - 1n;

/**
 * Encode a non-negative `bigint` (≤ u128::MAX) as LEB128 bytes.
 * @throws if the value is negative or exceeds u128::MAX.
 */
export function encodeVarint(value: bigint): number[] {
  if (value < 0n) {
    throw new Error(`varint: value must be non-negative, got ${value}`);
  }
  if (value > U128_MAX) {
    throw new Error(`varint: value exceeds u128::MAX (${value})`);
  }

  const out: number[] = [];
  let v = value;
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v & 0x7fn));
  return out;
}

/** Result of decoding a single varint: its value and the number of bytes consumed. */
export interface DecodedVarint {
  value: bigint;
  length: number;
}

/**
 * Decode a single LEB128 varint starting at `offset`.
 *
 * A u128 needs at most 19 base-128 digits; the 19th (index 18) may only carry the
 * two most-significant bits, matching the Runes reference decoder. Anything longer,
 * or a 19th byte with more than two significant bits, overflows u128.
 *
 * @throws if the input ends mid-varint or the value overflows u128.
 */
export function decodeVarint(bytes: Uint8Array, offset = 0): DecodedVarint {
  let result = 0n;
  let shift = 0n;

  for (let i = 0; i < 19; i++) {
    const byte = bytes[offset + i];
    if (byte === undefined) {
      throw new Error("varint: unexpected end of input");
    }

    // The final permissible byte (index 18, shift 126) can only contribute bits
    // 126 and 127 of the u128; more than two low bits set would overflow.
    if (i === 18 && (byte & 0x7f) > 0b11) {
      throw new Error("varint: overflows u128");
    }

    result |= BigInt(byte & 0x7f) << shift;

    if ((byte & 0x80) === 0) {
      return { value: result, length: i + 1 };
    }
    shift += 7n;
  }

  throw new Error("varint: overflows u128 (no terminator within 19 bytes)");
}

/**
 * Decode a contiguous stream of varints to the end of the buffer.
 * @throws if any varint is malformed or truncated.
 */
export function decodeAllVarints(bytes: Uint8Array): bigint[] {
  const values: bigint[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const { value, length } = decodeVarint(bytes, offset);
    values.push(value);
    offset += length;
  }
  return values;
}
