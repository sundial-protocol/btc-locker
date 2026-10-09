import { describe, test, expect } from "vitest";
import {
  formatRuneId,
  parseRuneId,
  runeIdDelta,
  runeIdFromDelta,
  runeIdEquals,
  compareRuneId,
  RUNE_ID_ZERO,
  type RuneId,
} from "../src/runes/rune-id";

describe("RuneId", () => {
  test("format / parse round-trip", () => {
    const id: RuneId = { block: 840000n, tx: 3n };
    expect(formatRuneId(id)).toBe("840000:3");
    expect(parseRuneId("840000:3")).toEqual(id);
  });

  test("parse rejects malformed ids", () => {
    expect(() => parseRuneId("840000")).toThrow();
    expect(() => parseRuneId("-1:0")).toThrow(/decimal digits/);
  });

  test("parse accepts decimal digits only", () => {
    // BigInt("") is 0n, so each of these used to parse, some as 0:0.
    for (const bad of [":", "840000:", ":7", " 12 : 3 ", "0x10:1", "1e3:1", "+1:2", "1:2:3", "1.0:2"]) {
      expect(() => parseRuneId(bad), bad).toThrow(/invalid rune id/);
    }
  });

  test("parse rejects ids ord would not accept", () => {
    expect(parseRuneId("0:0")).toEqual({ block: 0n, tx: 0n });
    expect(() => parseRuneId("0:1")).toThrow(/block 0/);
    expect(parseRuneId("18446744073709551615:4294967295")).toEqual({
      block: 18446744073709551615n,
      tx: 4294967295n,
    });
    expect(() => parseRuneId("18446744073709551616:0")).toThrow(/u64/);
    expect(() => parseRuneId("1:4294967296")).toThrow(/u32/);
  });

  test("delta encoding advances block then resets tx semantics", () => {
    // Same block → tx is a delta.
    expect(runeIdDelta({ block: 5n, tx: 2n }, { block: 5n, tx: 9n })).toEqual([0n, 7n]);
    // New block → tx is absolute.
    expect(runeIdDelta({ block: 5n, tx: 9n }, { block: 8n, tx: 1n })).toEqual([3n, 1n]);
  });

  test("delta / fromDelta are inverses across a sorted sequence", () => {
    const ids: RuneId[] = [
      { block: 840000n, tx: 1n },
      { block: 840000n, tx: 5n },
      { block: 840010n, tx: 0n },
      { block: 840010n, tx: 2n },
    ].sort(compareRuneId);

    let previous = RUNE_ID_ZERO;
    for (const id of ids) {
      const [b, t] = runeIdDelta(previous, id);
      const reconstructed = runeIdFromDelta(previous, b, t);
      expect(runeIdEquals(reconstructed, id)).toBe(true);
      previous = id;
    }
  });
});
