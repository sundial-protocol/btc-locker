import { describe, test, expect } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import {
  NativeRunestoneCodec,
  nativeRunestoneCodec,
} from "../src/native-codec";
import { encipherGuarded, CenotaphError } from "../src/guard";
import { RUNESTONE_MAGIC, type Runestone } from "../src/types";
import { runeCommitment, runeNameToNumber } from "../src/rune-name";
import { pushBytes } from "../src/script";

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
    expect(decoded.flaw).toBe("trailing-integers");
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

describe("bytes are plain Uint8Array, not Node Buffers", () => {
  test("encipher, encipherGuarded, runeCommitment and pushBytes return Uint8Array", () => {
    const runestone: Runestone = { edicts: [{ id: { block: 1n, tx: 1n }, amount: 5n, output: 0 }] };
    for (const bytes of [
      codec.encipher(runestone),
      encipherGuarded(runestone, codec),
      runeCommitment(runeNameToNumber("SOLSTICERECEIPT")),
      pushBytes(Uint8Array.from([1, 2, 3])),
    ]) {
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(Buffer.isBuffer(bytes)).toBe(false);
    }
  });

  test("decipher reads a Uint8Array and a Buffer alike", () => {
    const script = codec.encipher({ pointer: 1 });
    expect(codec.decipher(script)).toEqual(codec.decipher(Buffer.from(script)));
    expect(codec.decipher(script).cenotaph).toBe(false);
  });
});

describe("pushBytes length prefixes", () => {
  const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

  test("direct push up to 75 bytes", () => {
    expect(hex(pushBytes(new Uint8Array(0)))).toBe("00");
    expect(hex(pushBytes(new Uint8Array(75))).slice(0, 2)).toBe("4b");
  });

  test("OP_PUSHDATA1, OP_PUSHDATA2 and OP_PUSHDATA4 write little-endian lengths", () => {
    expect(hex(pushBytes(new Uint8Array(76))).slice(0, 4)).toBe("4c4c");
    expect(hex(pushBytes(new Uint8Array(255))).slice(0, 4)).toBe("4cff");
    expect(hex(pushBytes(new Uint8Array(256))).slice(0, 6)).toBe("4d0001");
    expect(hex(pushBytes(new Uint8Array(0xffff))).slice(0, 6)).toBe("4dffff");
    expect(hex(pushBytes(new Uint8Array(0x10000))).slice(0, 10)).toBe("4e00000100");
    expect(pushBytes(new Uint8Array(0x10000)).length).toBe(0x10000 + 5);
  });

  test("decipher reads a payload pushed with OP_PUSHDATA2 and OP_PUSHDATA4", () => {
    // The same one-edict payload, re-pushed with each wider length prefix.
    const direct = codec.encipher({ edicts: [{ id: { block: 1n, tx: 1n }, amount: 5n, output: 0 }] });
    const payload = direct.subarray(3);
    const wide = (prefix: number[]) =>
      Uint8Array.from([0x6a, RUNESTONE_MAGIC, ...prefix, ...payload]);
    const expected = codec.decipher(direct);
    expect(codec.decipher(wide([0x4d, payload.length, 0]))).toEqual(expected);
    expect(codec.decipher(wide([0x4e, payload.length, 0, 0, 0]))).toEqual(expected);
  });

  test("a truncated OP_PUSHDATA4 length is an invalid script", () => {
    const decoded = codec.decipher(Uint8Array.from([0x6a, RUNESTONE_MAGIC, 0x4e, 0xff, 0xff, 0xff, 0xff, 0x00]));
    expect(decoded.cenotaph).toBe(true);
    expect(decoded.flaw).toBe("invalid-script");
  });
});
