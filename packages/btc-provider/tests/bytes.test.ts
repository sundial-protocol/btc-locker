import { describe, expect, test } from "vitest";
import { fromHex, reversedHex } from "../src/bytes";

describe("fromHex", () => {
  test("reads either case", () => {
    expect([...fromHex("00ffAb")]).toEqual([0x00, 0xff, 0xab]);
  });

  test("throws the given message for odd length or non-hex", () => {
    expect(() => fromHex("abc", "odd")).toThrow("odd");
    expect(() => fromHex("zz", "not hex")).toThrow("not hex");
  });
});

describe("reversedHex", () => {
  test("writes the bytes last first", () => {
    expect(reversedHex(new Uint8Array([0x01, 0x02, 0xff]))).toBe("ff0201");
  });
});
