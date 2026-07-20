import { describe, test, expect } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import {
  NativeRunestoneCodec,
  nativeRunestoneCodec,
} from "../src/runes/native-codec";
import { encipherGuarded, CenotaphError } from "../src/runes/guard";
import { RUNESTONE_MAGIC, type Runestone } from "../src/runes/types";
import { runeNameToNumber } from "../src/runes/rune-name";

const codec = new NativeRunestoneCodec();

describe("NativeRunestoneCodec", () => {
  test("enciphered script begins OP_RETURN OP_13", () => {
    const script = codec.encipher({ edicts: [{ id: { block: 1n, tx: 1n }, amount: 5n, output: 0 }] });
    const chunks = bitcoin.script.decompile(script) ?? [];
    expect(chunks[0]).toBe(bitcoin.opcodes.OP_RETURN);
    expect(chunks[1]).toBe(RUNESTONE_MAGIC);
  });

  test("round-trips a full etching", () => {
    const runestone: Runestone = {
      etching: {
        rune: runeNameToNumber("EXAMPLERUNE"),
        divisibility: 8,
        symbol: 0x24, // '$'
        spacers: 0,
        premine: 2_100_000_000_000_000n,
        turbo: true,
      },
      pointer: 0,
    };
    const script = codec.encipher(runestone);
    const decoded = codec.decipher(script);
    expect(decoded.cenotaph).toBe(false);
    expect(decoded.runestone.etching).toEqual(runestone.etching);
    expect(decoded.runestone.pointer).toBe(0);
  });

  test("round-trips multiple edicts with delta-encoded ids", () => {
    const runestone: Runestone = {
      pointer: 1,
      edicts: [
        { id: { block: 840010n, tx: 2n }, amount: 10n, output: 0 },
        { id: { block: 840000n, tx: 1n }, amount: 7n, output: 1 },
      ],
    };
    const decoded = codec.decipher(codec.encipher(runestone));
    expect(decoded.cenotaph).toBe(false);
    // Edicts come back sorted ascending by id.
    expect(decoded.runestone.edicts).toEqual([
      { id: { block: 840000n, tx: 1n }, amount: 7n, output: 1 },
      { id: { block: 840010n, tx: 2n }, amount: 10n, output: 0 },
    ]);
    expect(decoded.runestone.pointer).toBe(1);
  });

  test("flags a non-runestone script as cenotaph", () => {
    const notRunestone = bitcoin.script.compile([
      bitcoin.opcodes.OP_RETURN,
      Buffer.from("hello"),
    ]);
    const decoded = codec.decipher(Buffer.from(notRunestone));
    expect(decoded.cenotaph).toBe(true);
  });

  test("flags a truncated edict body as cenotaph", () => {
    // Body tag (0) followed by only 3 integers → not a multiple of 4.
    const bad = bitcoin.script.compile([
      bitcoin.opcodes.OP_RETURN,
      RUNESTONE_MAGIC,
      Buffer.from([0x00, 0x01, 0x02, 0x03]),
    ]);
    const decoded = codec.decipher(Buffer.from(bad));
    expect(decoded.cenotaph).toBe(true);
    expect(decoded.flaws.join(" ")).toMatch(/multiple of 4/);
  });
});

describe("encipherGuarded (cenotaph guard)", () => {
  test("returns a script for a well-formed runestone", () => {
    const script = encipherGuarded(
      { edicts: [{ id: { block: 1n, tx: 1n }, amount: 5n, output: 0 }], pointer: 0 },
      nativeRunestoneCodec,
    );
    expect(script.length).toBeGreaterThan(2);
  });

  test("throws CenotaphError when the codec would emit a cenotaph", () => {
    // A stub codec that always deciphers to a cenotaph, to exercise the guard.
    const brokenCodec = {
      encipher: (r: Runestone) => nativeRunestoneCodec.encipher(r),
      decipher: () => ({ runestone: {}, cenotaph: true, flaws: ["forced"] }),
    };
    expect(() =>
      encipherGuarded({ edicts: [{ id: { block: 1n, tx: 1n }, amount: 1n, output: 0 }] }, brokenCodec),
    ).toThrow(CenotaphError);
  });
});
