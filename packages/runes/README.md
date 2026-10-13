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

Scripts and commitments are plain `Uint8Array`s, in and out, so the package
runs in a browser with no polyfill. A Node `Buffer` is a `Uint8Array` and can be
passed in as is. The results are not Buffers: for hex use
`Buffer.from(script).toString("hex")` on Node, or any hex encoder.

## Verification against ord

`ord` is the reference implementation of Runes, so the codec is tested against
it and not against itself. The claim is narrow: for a fixed set of cases, this
codec produces the same bytes and the same decoding as `ord`'s own Rust code.

### How it works

Three pieces, all under `tests/`:

| Piece | What it is |
| --- | --- |
| `vectors/ord-oracle/` | The oracle: a small Rust program that imports `ord`'s `ordinals` crate and calls its `Runestone::encipher` and `Runestone::decipher`. None of this package's code runs in it. `Cargo.toml` pins the crate to ord 0.29.0, commit `7e37a3bd3391044b39f5f11f20dfdb8b3764cd0e`. |
| `vectors/ord-runestones.json` | The oracle's output. Its `source` block records the ord tag and commit. |
| `ord-vectors.test.ts` | Feeds the same inputs to this codec and asserts equality. It runs in `npm test`, and so in the `test` jobs in CI. |

The vectors file holds 64 cases:

| Block | Cases | What ord supplies | What the test asserts |
| --- | --- | --- | --- |
| `encipher` | 13 runestones | The script ord enciphers, and what ord deciphers from it. | Same script, byte for byte; deciphering it gives the same fields. |
| `decipher` | 40 scripts: 26 cenotaphs, 12 valid edge cases, 2 non-runestones | Ord's verdict: a runestone and its fields, a cenotaph and its flaw, or nothing. | Same verdict, same flaw name, same fields. |
| `runeNames` | 7 names | The rune number and the commitment bytes. | `runeNameToNumber`, `numberToRuneName` and `runeCommitment` agree. |
| `spacedRunes` | 4 names | The name without spacers, and the spacer bitmask. | `parseSpacedRune` and `formatSpacedRune` agree. |

### Checking it yourself

**1. The oracle is ord 0.29.0.** Compare the `rev` in
`tests/vectors/ord-oracle/Cargo.toml` with the commit the
[0.29.0 tag](https://github.com/ordinals/ord/releases/tag/0.29.0) points to.
Then read `src/main.rs`: `encipher_vector` takes its script from
`runestone.encipher()`, and `deciphered` calls `Runestone::decipher`.

**2. The vectors file is what the oracle prints.** Regenerate it and confirm
nothing changes. This needs Rust 1.89 or later, and the first build takes a few
minutes. If your default toolchain is older, set `RUSTUP_TOOLCHAIN` to a newer
one that is installed.

```
bash tests/vectors/ord-oracle/generate.sh
git diff --stat -- tests/vectors
```

An empty diff means the committed file is ord's output and was not edited by
hand. CI runs the same check on every pull request: the `Runes vectors (ord
oracle)` job regenerates the file and fails if it differs. The script builds outside the repository, under
`~/.cache/btc-runes-ord-oracle`, unless `CARGO_TARGET_DIR` is set.

**3. Decode a vector by hand.** The first `encipher` vector is

```
6a5d1c020504d3a9a8f9aff6d0260108034005240680809dd085bedd031600
```

| Bytes | Meaning |
| --- | --- |
| `6a 5d` | `OP_RETURN`, `OP_13`: the runestone marker |
| `1c` | Push the next 28 bytes: the payload |
| `02 05` | Tag 2 (flags) = 5: etching (bit 0) and turbo (bit 2) |
| `04 d3a9a8f9aff6d026` | Tag 4 (rune) = 21748009270908115, the name `EXAMPLETOKEN` |
| `01 08` | Tag 1 (divisibility) = 8 |
| `03 40` | Tag 3 (spacers) = 64: bit 6, a spacer after the 7th letter, so `EXAMPLE•TOKEN` |
| `05 24` | Tag 5 (symbol) = `$` |
| `06 80809dd085bedd03` | Tag 6 (premine) = 2,100,000,000,000,000 |
| `16 00` | Tag 22 (pointer) = output 0 |

The payload is a list of tag and value pairs, each a LEB128 varint: 7 bits per
byte, low bits first, and a set top bit means another byte follows. The fields
match the `runestone` block of that vector in the JSON.

**4. The test can fail.** Change one hex digit of a `scriptPubKey` in
`ord-runestones.json` and run `npm test`. That vector fails. Revert the change.

**5. Against a running ord.** This package has no regtest suite of its own. The
regtest suites of `@sundial-protocol/solstice` and the CLI broadcast real
transactions built with this codec and ask a live `ord` index what it recorded:
that the rune exists, with the right supply at the right address. From the
repository root:

```
npm run regtest --workspace=@sundial-protocol/solstice
```

To check one transaction without those suites, `ord decode --txid <txid>` (or
`--file <raw transaction>`) prints the runestone ord reads from it.

### What this does not prove

It covers the 64 cases above, not every possible runestone, and it pins one ord
release. See [Limits](#limits).

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
