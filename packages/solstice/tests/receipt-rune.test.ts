import { describe, test, expect } from "vitest";
import {
  receiptEtching,
  receiptEdict,
  requireEtched,
  isEtched,
  type ReceiptRune,
} from "../src/receipt/receipt-rune";
import { runeNameToNumber } from "../src/runes/rune-name";

const exampleRune: ReceiptRune = {
  name: "EXAMPLERUNE",
  displayTicker: "RT",
  id: { block: 840000n, tx: 7n },
  divisibility: 8,
  symbol: 0x24,
  totalSupply: 2_100_000_000_000_000n,
};

describe("ReceiptRune", () => {
  test("receiptEtching premines full supply with closed terms and turbo", () => {
    const etching = receiptEtching(exampleRune);
    expect(etching.rune).toBe(runeNameToNumber("EXAMPLERUNE"));
    expect(etching.premine).toBe(exampleRune.totalSupply);
    expect(etching.divisibility).toBe(8);
    expect(etching.terms).toBeUndefined(); // closed supply, no open mint
    expect(etching.turbo).toBe(true);
  });

  test("receiptEtching validates supply and divisibility", () => {
    expect(() => receiptEtching({ ...exampleRune, totalSupply: 0n })).toThrow(/positive/);
    expect(() => receiptEtching({ ...exampleRune, divisibility: 39 })).toThrow(/0\.\.38/);
  });

  test("receiptEdict builds an edict against the frozen id", () => {
    expect(receiptEdict(exampleRune, 100n, 0)).toEqual({
      id: exampleRune.id,
      amount: 100n,
      output: 0,
    });
    expect(() => receiptEdict(exampleRune, 0n, 0)).toThrow(/positive/);
  });

  test("requireEtched guards against un-etched runes", () => {
    const draft: ReceiptRune = { ...exampleRune, id: undefined };
    expect(isEtched(draft)).toBe(false);
    expect(() => requireEtched(draft)).toThrow(/no rune id/);
    expect(isEtched(exampleRune)).toBe(true);
  });
});
