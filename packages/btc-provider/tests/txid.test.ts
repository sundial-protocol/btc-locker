import { describe, test, expect } from "vitest";
import { sha256, transactionId } from "../src/txid";
import { LEGACY_TX, SEGWIT_TX } from "./fixtures";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("sha256", () => {
  // FIPS 180-4 examples, and lengths either side of the padding boundaries.
  const vectors: Array<[string, string]> = [
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
  ];
  test.each(vectors)("of %j", (input, expected) => {
    expect(hex(sha256(new TextEncoder().encode(input)))).toBe(expected);
  });

  test("agrees with Node's crypto at every length up to 200 bytes", async () => {
    const { createHash } = await import("node:crypto");
    for (let length = 0; length <= 200; length++) {
      const data = Uint8Array.from(
        { length },
        (_, i) => (i * 31 + length) & 255
      );
      expect(hex(sha256(data))).toBe(
        createHash("sha256").update(data).digest("hex")
      );
    }
  });
});

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
    expect(() => transactionId("0200")).toThrow("truncated");
    expect(() => transactionId(SEGWIT_TX.hex.slice(0, 120))).toThrow(
      "truncated"
    );
  });
});
