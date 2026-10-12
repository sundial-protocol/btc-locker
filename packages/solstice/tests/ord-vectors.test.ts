/**
 * Reference vectors from `ord`, the Runes reference implementation.
 *
 * `vectors/ord-runestones.json` is written by `vectors/ord-oracle` (a small Rust
 * program around ord's `ordinals` crate, pinned to the commit recorded in the
 * file's `source` block). Every scriptPubKey and every runestone/cenotaph
 * verdict in it is ord's, so these tests compare the native codec against ord
 * and not against itself. Regenerate with `vectors/ord-oracle/generate.sh`.
 *
 * Where the native decoder still differs from ord:
 *
 * - It reads one scriptPubKey, not a transaction. ord takes the first output
 *   that starts with `OP_RETURN OP_13`; choosing the output is the caller's job.
 * - "edict output above the output count" and "pointer at or above the output
 *   count" need the transaction's output count. They are only checked when the
 *   caller passes `{ outputCount }`; without it both pass as valid.
 * - For a script that is not a runestone ord returns nothing. The native decoder
 *   returns `cenotaph: true` with no `flaw`, so the pre-sign guard still rejects
 *   it.
 * - For a cenotaph ord reports only the etched rune and the mint. The native
 *   decoder also returns whatever else it parsed, as a debugging aid.
 */

import { describe, test, expect } from "vitest";
import vectors from "./vectors/ord-runestones.json";
import { nativeRunestoneCodec } from "../src/runes/native-codec";
import {
  numberToRuneName,
  runeCommitment,
  runeNameToNumber,
  parseSpacedRune,
  formatSpacedRune,
} from "../src/runes/rune-name";
import type { Runestone } from "../src/runes/types";

interface JsonRuneId {
  block: string;
  tx: string;
}
interface JsonRunestone {
  etching?: {
    rune?: string;
    divisibility?: number;
    spacers?: number;
    symbol?: number;
    premine?: string;
    terms?: Record<string, string>;
    turbo: boolean;
  };
  edicts?: Array<{ id: JsonRuneId; amount: string; output: number }>;
  mint?: JsonRuneId;
  pointer?: number;
}
type OrdArtifact =
  | { type: "runestone"; runestone: JsonRunestone }
  | { type: "cenotaph"; flaw: string; etching: string | null; mint: JsonRuneId | null }
  | null;

const big = (s: string | undefined): bigint | undefined =>
  s === undefined ? undefined : BigInt(s);
const id = (j: JsonRuneId) => ({ block: BigInt(j.block), tx: BigInt(j.tx) });

/** Vector JSON → the codec's {@link Runestone} input type. */
function fromJson(j: JsonRunestone): Runestone {
  const r: Runestone = {};
  if (j.etching) {
    const e = j.etching;
    r.etching = {
      rune: big(e.rune),
      divisibility: e.divisibility,
      spacers: e.spacers,
      symbol: e.symbol,
      premine: big(e.premine),
      turbo: e.turbo,
    };
    if (e.terms) {
      r.etching.terms = {
        amount: big(e.terms.amount),
        cap: big(e.terms.cap),
        heightStart: big(e.terms.heightStart),
        heightEnd: big(e.terms.heightEnd),
        offsetStart: big(e.terms.offsetStart),
        offsetEnd: big(e.terms.offsetEnd),
      };
    }
  }
  if (j.edicts) {
    r.edicts = j.edicts.map((e) => ({
      id: id(e.id),
      amount: BigInt(e.amount),
      output: e.output,
    }));
  }
  if (j.mint) r.mint = id(j.mint);
  if (j.pointer !== undefined) r.pointer = j.pointer;
  return r;
}

/** A decoded {@link Runestone} → the vector JSON shape (bigints as strings, no undefined). */
function toJson(r: Runestone): JsonRunestone {
  return JSON.parse(
    JSON.stringify(r, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
}

function expectMatchesOrd(scriptHex: string, outputs: number, ord: OrdArtifact): void {
  const got = nativeRunestoneCodec.decipher(Buffer.from(scriptHex, "hex"), {
    outputCount: outputs,
  });

  if (ord === null) {
    expect(got.cenotaph).toBe(true);
    expect(got.flaw).toBeUndefined();
    return;
  }
  if (ord.type === "cenotaph") {
    expect(got.cenotaph).toBe(true);
    expect(got.flaw).toBe(ord.flaw);
    expect(got.runestone.etching?.rune?.toString() ?? null).toBe(ord.etching);
    expect(got.runestone.mint ? toJson(got.runestone).mint : null).toEqual(ord.mint);
    return;
  }
  expect(got.flaws).toEqual([]);
  expect(got.cenotaph).toBe(false);
  expect(got.flaw).toBeUndefined();
  expect(toJson(got.runestone)).toEqual(ord.runestone);
}

describe(`ord ${vectors.source.tag} reference vectors (${vectors.source.commit.slice(0, 8)})`, () => {
  describe("encipher produces ord's exact bytes, decipher returns ord's fields", () => {
    for (const v of vectors.encipher) {
      test(v.name, () => {
        const script = nativeRunestoneCodec.encipher(fromJson(v.runestone as JsonRunestone));
        expect(script.toString("hex")).toBe(v.scriptPubKey);
        expectMatchesOrd(v.scriptPubKey, v.outputs, v.ord as OrdArtifact);
      });
    }
  });

  describe("decipher classifies scripts the way ord does", () => {
    for (const v of vectors.decipher) {
      test(v.name, () => {
        expectMatchesOrd(v.scriptPubKey, v.outputs, v.ord as OrdArtifact);
      });
    }
  });

  test("output-count rules are skipped when no output count is given", () => {
    const edictOutput = vectors.decipher.find(
      (v) => v.name === "edict output above the output count",
    )!;
    const pointer = vectors.decipher.find(
      (v) => v.name === "pointer at or above the output count",
    )!;
    for (const v of [edictOutput, pointer]) {
      expect((v.ord as OrdArtifact)?.type).toBe("cenotaph");
      const got = nativeRunestoneCodec.decipher(Buffer.from(v.scriptPubKey, "hex"));
      expect(got.cenotaph).toBe(false);
    }
  });

  describe("rune names", () => {
    for (const v of vectors.runeNames) {
      test(`${v.name} is ${v.number}, commitment ${v.commitment || "(empty)"}`, () => {
        expect(runeNameToNumber(v.name).toString()).toBe(v.number);
        expect(numberToRuneName(BigInt(v.number))).toBe(v.name);
        expect(runeCommitment(BigInt(v.number)).toString("hex")).toBe(v.commitment);
      });
    }
    for (const v of vectors.spacedRunes) {
      test(`${v.spaced} is ${v.name} with spacers ${v.spacers}`, () => {
        expect(parseSpacedRune(v.spaced)).toEqual({ name: v.name, spacers: v.spacers });
        expect(formatSpacedRune(v.name, v.spacers)).toBe(v.spaced);
      });
    }
  });
});
