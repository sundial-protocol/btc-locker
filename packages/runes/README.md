# @sundial-protocol/btc-runes

Bitcoin Runes primitives: a runestone encoder and decoder checked against `ord`,
rune names and commitments, rune ids, and LEB128 varints.

It has no runtime dependencies and imports no Sundial package. It builds and
reads the `OP_RETURN OP_13 <payload>` script of a runestone. It does not build
transactions, sign, or look up balances. `@sundial-protocol/solstice` uses it for
the receipt token and re-exports its names.

## What is in it

| Export | What it is |
| --- | --- |
| `nativeRunestoneCodec`, `NativeRunestoneCodec` | `encipher(runestone)` returns the scriptPubKey; `decipher(script, { outputCount })` returns the runestone, or a cenotaph with ord's flaw name. |
| `RunestoneCodec` | The interface builders should depend on, so another implementation can be passed in. |
| `encipherGuarded`, `CenotaphError` | Enciphers, deciphers, and throws unless the result is a non-cenotaph that re-enciphers to the same bytes. Use it before signing. |
| `runeNameToNumber`, `numberToRuneName`, `parseSpacedRune`, `formatSpacedRune`, `runeCommitment` | Rune names, spacers, and the commitment bytes an etching has to reveal. |
| `parseRuneId`, `formatRuneId`, `compareRuneId`, `runeIdDelta`, `runeIdFromDelta` | Rune ids (`block:tx`) and the delta encoding edicts use. |
| `encodeVarint`, `decodeVarint`, `decodeAllVarints` | LEB128 varints up to `U128_MAX`. |
| `Runestone`, `Etching`, `Edict`, `Terms`, `Flaw`, `Tag`, `Flag` | The data model and wire constants. |
| `pushBytes` | A minimal data push, as used for the payload and for the commitment in an etching's tapscript. |

## Usage

```ts
import {
  encipherGuarded,
  nativeRunestoneCodec,
  parseRuneId,
  type Runestone,
} from "@sundial-protocol/btc-runes";

// Send 1000 units of rune 840000:1 to output 1; anything left goes to output 2.
const runestone: Runestone = {
  edicts: [{ id: parseRuneId("840000:1"), amount: 1000n, output: 1 }],
  pointer: 2,
};

// Pass the transaction's output count so the output-index rules are checked.
const script = encipherGuarded(runestone, nativeRunestoneCodec, { outputCount: 4 });

const decoded = nativeRunestoneCodec.decipher(script, { outputCount: 4 });
if (decoded.cenotaph) throw new Error(decoded.flaws.join("; "));
```

Scripts and commitments are Node `Buffer`s. In a browser the bundler has to
provide `Buffer`.

## Verification against ord

`ord` is the reference implementation of Runes, so the codec is tested against
it and not against itself.

`tests/vectors/ord-runestones.json` is written by `tests/vectors/ord-oracle`, a
small Rust program around `ord`'s `ordinals` crate (ord 0.29.0, commit
`7e37a3bd3391044b39f5f11f20dfdb8b3764cd0e`). `tests/ord-vectors.test.ts` asserts
that the codec enciphers to the same bytes and deciphers to the same fields, the
same cenotaph verdict and the same flaw: 13 runestones, 40 scripts (26
cenotaphs, 12 valid edge cases, 2 non-runestones), plus rune names, commitments
and spacers. It runs in `npm test`. To regenerate (Rust 1.89 or later):

```
bash tests/vectors/ord-oracle/generate.sh
```

This package has no regtest suite of its own. The codec is exercised against a
live `ord` index by the regtest suites of `@sundial-protocol/solstice` and the
CLI.

## Limits

- The decoder reads one scriptPubKey, not a transaction. Picking the runestone
  output (ord takes the first one that starts `OP_RETURN OP_13`) is the caller's
  job.
- Two cenotaph rules need the transaction's output count: an edict output above
  it, and a pointer at or above it. They are checked only when the caller passes
  `outputCount`.
- For a script that is not a runestone ord returns nothing. This decoder returns
  `cenotaph: true` with no flaw, so `encipherGuarded` still rejects it.
- The vectors pin one ord release. If a later ord changes the grammar they have
  to be regenerated; nothing checks for that automatically.
- Only `ord` has been checked. No other indexer, wallet or explorer has.
