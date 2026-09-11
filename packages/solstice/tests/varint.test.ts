import { describe, test, expect } from "vitest";
import {
  encodeVarint,
  decodeVarint,
  decodeAllVarints,
  U128_MAX,
} from "../src/runes/varint";

describe("LEB128 varint (u128)", () => {
  test("known vectors", () => {
    expect(encodeVarint(0n)).toEqual([0x00]);
    expect(encodeVarint(1n)).toEqual([0x01]);
    expect(encodeVarint(127n)).toEqual([0x7f]);
    expect(encodeVarint(128n)).toEqual([0x80, 0x01]);
    expect(encodeVarint(300n)).toEqual([0xac, 0x02]);
    expect(encodeVarint(16384n)).toEqual([0x80, 0x80, 0x01]);
  });

  test("round-trips a spread of values including u128::MAX", () => {
    const values = [
      0n,
      1n,
      42n,
      127n,
      128n,
      255n,
      256n,
      65535n,
      1_000_000n,
      2n ** 64n,
      2n ** 100n,
      U128_MAX,
    ];
    for (const v of values) {
      const bytes = Uint8Array.from(encodeVarint(v));
      const { value, length } = decodeVarint(bytes);
      expect(value).toBe(v);
      expect(length).toBe(bytes.length);
    }
  });

  test("decodes a concatenated stream", () => {
    const bytes = Uint8Array.from([
      ...encodeVarint(1n),
      ...encodeVarint(300n),
      ...encodeVarint(0n),
    ]);
    expect(decodeAllVarints(bytes)).toEqual([1n, 300n, 0n]);
  });

  test("rejects negative and over-max values", () => {
    expect(() => encodeVarint(-1n)).toThrow(/non-negative/);
    expect(() => encodeVarint(U128_MAX + 1n)).toThrow(/u128::MAX/);
  });

  test("rejects truncated input", () => {
    expect(() => decodeVarint(Uint8Array.from([0x80]))).toThrow(/unexpected end/);
  });

  test("rejects varints that overflow u128", () => {
    // 20 continuation bytes then a terminator → far beyond u128.
    const tooLong = Uint8Array.from([...Array(20).fill(0x80), 0x00]);
    expect(() => decodeVarint(tooLong)).toThrow(/overflow/);
  });
});
