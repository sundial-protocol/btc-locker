/**
 * Native reference implementation of {@link RunestoneCodec}.
 *
 * Scope: encodes and decodes the Etching + Edict + Mint + Pointer subset of the
 * Runes grammar that Solstice uses, and round-trips its own output exactly. Its
 * decoder targets **round-trip correctness for self-produced runestones** (which
 * is what the pre-sign cenotaph guard needs), not full adversarial cenotaph
 * classification of arbitrary third-party runestones — that is a job for the
 * security-reviewed library the Runes decision record still has to pin. Do not
 * rely on this decoder to police hostile inputs from the mempool.
 */

import * as bitcoin from "bitcoinjs-lib";
import type { RunestoneCodec } from "./codec.js";
import {
  Tag,
  Flag,
  flagMask,
  RUNESTONE_MAGIC,
  type Etching,
  type Edict,
  type Runestone,
  type DecipherResult,
} from "./types.js";
import {
  RUNE_ID_ZERO,
  runeIdDelta,
  runeIdFromDelta,
  compareRuneId,
} from "./rune-id.js";
import { encodeVarint, decodeAllVarints } from "./varint.js";

/** Maximum bytes per data push; larger payloads are split across pushes. */
const MAX_PUSH = 520;

/** Tags this codec recognizes (used to classify unknown even tags as cenotaphs). */
const KNOWN_TAGS = new Set<bigint>([
  BigInt(Tag.Body),
  BigInt(Tag.Flags),
  BigInt(Tag.Rune),
  BigInt(Tag.Premine),
  BigInt(Tag.Cap),
  BigInt(Tag.Amount),
  BigInt(Tag.HeightStart),
  BigInt(Tag.HeightEnd),
  BigInt(Tag.OffsetStart),
  BigInt(Tag.OffsetEnd),
  BigInt(Tag.Mint),
  BigInt(Tag.Pointer),
  BigInt(Tag.Divisibility),
  BigInt(Tag.Spacers),
  BigInt(Tag.Symbol),
]);

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export class NativeRunestoneCodec implements RunestoneCodec {
  encipher(runestone: Runestone): Buffer {
    const stream: bigint[] = [];

    const pushTag = (tag: Tag, values: bigint[]): void => {
      for (const v of values) {
        stream.push(BigInt(tag));
        stream.push(v);
      }
    };
    const pushTagOpt = (tag: Tag, value: bigint | undefined): void => {
      if (value !== undefined) pushTag(tag, [value]);
    };

    // ── Etching ──────────────────────────────────────────────────────────────
    const e = runestone.etching;
    if (e) {
      let flags = flagMask(Flag.Etching);
      if (e.terms) flags |= flagMask(Flag.Terms);
      if (e.turbo) flags |= flagMask(Flag.Turbo);

      pushTag(Tag.Flags, [flags]);
      pushTagOpt(Tag.Rune, e.rune);
      pushTagOpt(
        Tag.Divisibility,
        e.divisibility === undefined ? undefined : BigInt(e.divisibility),
      );
      pushTagOpt(
        Tag.Spacers,
        e.spacers === undefined ? undefined : BigInt(e.spacers),
      );
      pushTagOpt(
        Tag.Symbol,
        e.symbol === undefined ? undefined : BigInt(e.symbol),
      );
      pushTagOpt(Tag.Premine, e.premine);

      if (e.terms) {
        pushTagOpt(Tag.Amount, e.terms.amount);
        pushTagOpt(Tag.Cap, e.terms.cap);
        pushTagOpt(Tag.HeightStart, e.terms.heightStart);
        pushTagOpt(Tag.HeightEnd, e.terms.heightEnd);
        pushTagOpt(Tag.OffsetStart, e.terms.offsetStart);
        pushTagOpt(Tag.OffsetEnd, e.terms.offsetEnd);
      }
    }

    // ── Mint / Pointer ───────────────────────────────────────────────────────
    if (runestone.mint) {
      pushTag(Tag.Mint, [runestone.mint.block, runestone.mint.tx]);
    }
    pushTagOpt(
      Tag.Pointer,
      runestone.pointer === undefined ? undefined : BigInt(runestone.pointer),
    );

    // ── Body / Edicts ────────────────────────────────────────────────────────
    const edicts = runestone.edicts ?? [];
    if (edicts.length > 0) {
      stream.push(BigInt(Tag.Body));
      const sorted = [...edicts].sort((a, b) => compareRuneId(a.id, b.id));
      let previous = RUNE_ID_ZERO;
      for (const edict of sorted) {
        const [blockDelta, txValue] = runeIdDelta(previous, edict.id);
        stream.push(blockDelta);
        stream.push(txValue);
        stream.push(edict.amount);
        stream.push(BigInt(edict.output));
        previous = edict.id;
      }
    }

    // ── Serialize ────────────────────────────────────────────────────────────
    const bytes: number[] = [];
    for (const v of stream) bytes.push(...encodeVarint(v));
    const payload = Buffer.from(bytes);

    const chunks: Array<number | Buffer> = [
      bitcoin.opcodes.OP_RETURN,
      RUNESTONE_MAGIC,
    ];
    for (let i = 0; i < payload.length; i += MAX_PUSH) {
      chunks.push(payload.subarray(i, i + MAX_PUSH));
    }
    // An etching- or mint-only runestone with no data bytes still needs a valid
    // script; script.compile handles the no-data case (just OP_RETURN OP_13).
    return Buffer.from(bitcoin.script.compile(chunks));
  }

  decipher(scriptPubKey: Buffer): DecipherResult {
    const flaws: string[] = [];
    const runestone: Runestone = {};

    const chunks = bitcoin.script.decompile(scriptPubKey);
    if (
      !chunks ||
      chunks.length < 2 ||
      chunks[0] !== bitcoin.opcodes.OP_RETURN ||
      chunks[1] !== RUNESTONE_MAGIC
    ) {
      return {
        runestone,
        cenotaph: true,
        flaws: ["not a runestone: missing OP_RETURN OP_13 prefix"],
      };
    }

    // Concatenate the data pushes after the magic; a non-push opcode is a cenotaph.
    const parts: Buffer[] = [];
    for (let i = 2; i < chunks.length; i++) {
      const c = chunks[i];
      if (!Buffer.isBuffer(c)) {
        return {
          runestone,
          cenotaph: true,
          flaws: ["non-data-push opcode in runestone payload"],
        };
      }
      parts.push(c);
    }
    const payload = Buffer.concat(parts);

    let integers: bigint[];
    try {
      integers = decodeAllVarints(payload);
    } catch (err) {
      return {
        runestone,
        cenotaph: true,
        flaws: [`invalid varint: ${(err as Error).message}`],
      };
    }

    const fields = new Map<bigint, bigint[]>();
    const edicts: Edict[] = [];
    let cenotaph = false;
    let i = 0;

    while (i < integers.length) {
      const tag = integers[i];

      if (tag === BigInt(Tag.Body)) {
        i += 1;
        const body = integers.slice(i);
        if (body.length % 4 !== 0) {
          cenotaph = true;
          flaws.push("edict body length is not a multiple of 4");
        }
        const complete = body.length - (body.length % 4);
        let previous = RUNE_ID_ZERO;
        for (let j = 0; j < complete; j += 4) {
          const id = runeIdFromDelta(previous, body[j], body[j + 1]);
          const amount = body[j + 2];
          const outputBig = body[j + 3];
          if (outputBig > MAX_SAFE) {
            cenotaph = true;
            flaws.push("edict output index exceeds safe integer range");
          }
          edicts.push({ id, amount, output: Number(outputBig) });
          previous = id;
        }
        i = integers.length;
        break;
      }

      const value = integers[i + 1];
      if (value === undefined) {
        cenotaph = true;
        flaws.push(`truncated field: tag ${tag} has no value`);
        break;
      }
      if (!KNOWN_TAGS.has(tag) && tag % 2n === 0n) {
        cenotaph = true;
        flaws.push(`unrecognized even tag ${tag}`);
      }
      const arr = fields.get(tag) ?? [];
      arr.push(value);
      fields.set(tag, arr);
      i += 2;
    }

    const first = (tag: Tag): bigint | undefined => fields.get(BigInt(tag))?.[0];

    const flags = first(Tag.Flags) ?? 0n;
    if ((flags & flagMask(Flag.Etching)) !== 0n) {
      const etching: Etching = { turbo: (flags & flagMask(Flag.Turbo)) !== 0n };
      const rune = first(Tag.Rune);
      if (rune !== undefined) etching.rune = rune;
      const div = first(Tag.Divisibility);
      if (div !== undefined) etching.divisibility = Number(div);
      const spacers = first(Tag.Spacers);
      if (spacers !== undefined) etching.spacers = Number(spacers);
      const symbol = first(Tag.Symbol);
      if (symbol !== undefined) etching.symbol = Number(symbol);
      const premine = first(Tag.Premine);
      if (premine !== undefined) etching.premine = premine;
      if ((flags & flagMask(Flag.Terms)) !== 0n) {
        etching.terms = {
          amount: first(Tag.Amount),
          cap: first(Tag.Cap),
          heightStart: first(Tag.HeightStart),
          heightEnd: first(Tag.HeightEnd),
          offsetStart: first(Tag.OffsetStart),
          offsetEnd: first(Tag.OffsetEnd),
        };
      }
      runestone.etching = etching;
    }

    const mintVals = fields.get(BigInt(Tag.Mint));
    if (mintVals && mintVals.length >= 2) {
      runestone.mint = { block: mintVals[0], tx: mintVals[1] };
    }
    const pointer = first(Tag.Pointer);
    if (pointer !== undefined) runestone.pointer = Number(pointer);
    if (edicts.length > 0) runestone.edicts = edicts;

    return { runestone, cenotaph, flaws };
  }
}

/** A ready-to-use shared instance of the native codec. */
export const nativeRunestoneCodec = new NativeRunestoneCodec();
