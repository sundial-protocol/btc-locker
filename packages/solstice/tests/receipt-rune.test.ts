import { describe, test, expect } from "vitest";
import {
  receiptEtching,
  receiptEdict,
  requireEtched,
  isEtched,
  type ReceiptRune,
} from "../src/receipt/receipt-rune";
import { runeNameToNumber } from "../src/runes/rune-name";

const qbtc: ReceiptRune = {
  name: "SUNDIALQBTC",
  displayTicker: "qBTC",
  id: { block: 840000n, tx: 7n },
  divisibility: 8,
  symbol: 0x71,
  totalSupply: 2_100_000_000_000_000n,
};

describe("ReceiptRune", () => {
  test("receiptEtching premines full supply with closed terms and turbo", () => {
    const etching = receiptEtching(qbtc);
    expect(etching.rune).toBe(runeNameToNumber("SUNDIALQBTC"));
    expect(etching.premine).toBe(qbtc.totalSupply);
    expect(etching.divisibility).toBe(8);
    expect(etching.terms).toBeUndefined(); // closed supply, no open mint
    expect(etching.turbo).toBe(true);
  });

  test("receiptEtching validates supply and divisibility", () => {
    expect(() => receiptEtching({ ...qbtc, totalSupply: 0n })).toThrow(/positive/);
    expect(() => receiptEtching({ ...qbtc, divisibility: 39 })).toThrow(/0\.\.38/);
  });

  test("receiptEdict builds an edict against the frozen id", () => {
    expect(receiptEdict(qbtc, 100n, 0)).toEqual({
      id: qbtc.id,
      amount: 100n,
      output: 0,
    });
    expect(() => receiptEdict(qbtc, 0n, 0)).toThrow(/positive/);
  });

  test("requireEtched guards against un-etched runes", () => {
    const draft: ReceiptRune = { ...qbtc, id: undefined };
    expect(isEtched(draft)).toBe(false);
    expect(() => requireEtched(draft)).toThrow(/no rune id/);
    expect(isEtched(qbtc)).toBe(true);
  });
});
