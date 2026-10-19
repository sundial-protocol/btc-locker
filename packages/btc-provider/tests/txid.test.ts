import { describe, test, expect } from "vitest";
import { transactionId } from "../src/txid";
import { LEGACY_TX, SEGWIT_TX } from "./fixtures";

describe("transactionId", () => {
  test("of a transaction without witness data", () => {
    expect(transactionId(LEGACY_TX.hex)).toBe(LEGACY_TX.txid);
  });

  test("of a transaction with witness data leaves the witness out", () => {
    expect(transactionId(SEGWIT_TX.hex)).toBe(SEGWIT_TX.txid);
  });

  test("ignores case and surrounding whitespace", () => {
    expect(transactionId(` ${SEGWIT_TX.hex.toUpperCase()}\n`)).toBe(
      SEGWIT_TX.txid
    );
  });

  test("throws for something that is not a transaction", () => {
    expect(() => transactionId("zz")).toThrow("not valid hex");
    expect(() => transactionId("0200")).toThrow("could not be parsed");
    expect(() => transactionId(SEGWIT_TX.hex.slice(0, 120))).toThrow(
      "could not be parsed"
    );
  });
});
