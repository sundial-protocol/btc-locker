import { describe, test, expect } from "vitest";
import {
  runeNameToNumber,
  numberToRuneName,
} from "../src/runes/rune-name";

describe("rune name codec (modified base-26)", () => {
  test("known vectors", () => {
    expect(runeNameToNumber("A")).toBe(0n);
    expect(runeNameToNumber("B")).toBe(1n);
    expect(runeNameToNumber("Z")).toBe(25n);
    expect(runeNameToNumber("AA")).toBe(26n);
    expect(runeNameToNumber("AB")).toBe(27n);
    expect(runeNameToNumber("AAA")).toBe(702n);
  });

  test("round-trips real Solstice instance names", () => {
    for (const name of ["SOLSTICERECEIPT", "SUNDIALQBTC", "A", "Z", "ZZZZZZZZ"]) {
      expect(numberToRuneName(runeNameToNumber(name))).toBe(name);
    }
  });

  test("rejects non A–Z input", () => {
    expect(() => runeNameToNumber("")).toThrow(/empty/);
    expect(() => runeNameToNumber("qbtc")).toThrow(/A–Z/);
    expect(() => runeNameToNumber("AB1")).toThrow(/A–Z/);
  });
});
