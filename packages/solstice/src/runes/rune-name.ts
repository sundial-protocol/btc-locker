/**
 * Rune name ⇄ `u128` codec (modified base-26), matching the Runes reference
 * implementation (`ord`).
 *
 * Names are strings of `A`–`Z`. The encoding is a bijection onto `u128`:
 *   "A" → 0, "B" → 1, … "Z" → 25, "AA" → 26, "AB" → 27, …
 *
 * On-chain a rune stores this number, not the letters; spacers (`•`) are a
 * separate display-only field (see {@link Etching.spacers}).
 */

const U128_MAX = (1n << 128n) - 1n;

/** The name of rune number `u128::MAX`. Longer or later names do not exist. */
export const LARGEST_RUNE_NAME = "BCGDENLQRQWDSLRUGSNLBTMFIJAV";

/**
 * Encode an A–Z rune name to its `u128` number.
 * @throws if the name is empty, has other characters, or is past the largest name.
 */
export function runeNameToNumber(name: string): bigint {
  if (name.length === 0) {
    throw new Error("rune name must not be empty");
  }
  let x = 0n;
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code < 65 || code > 90) {
      throw new Error(
        `rune name must be A–Z only; invalid character "${name[i]}" at index ${i}`,
      );
    }
    if (i > 0) {
      x += 1n;
    }
    x = x * 26n + BigInt(code - 65);
    if (x > U128_MAX) {
      throw new Error(
        `rune name "${name}" is out of range: the largest name is ${LARGEST_RUNE_NAME}`,
      );
    }
  }
  return x;
}

/** Decode a `u128` rune number back to its A–Z name. */
export function numberToRuneName(n: bigint): string {
  if (n < 0n) {
    throw new Error(`rune number must be non-negative, got ${n}`);
  }
  let x = n + 1n;
  let name = "";
  while (x > 0n) {
    x -= 1n;
    name = String.fromCharCode(65 + Number(x % 26n)) + name;
    x = x / 26n;
  }
  return name;
}

/**
 * The commitment to a rune name that an etching's reveal must carry: the rune
 * number as little-endian bytes with trailing zero bytes removed (ord's
 * `Rune::commitment`). It has to appear as a data push in a tapscript spent by
 * the etching transaction, or indexers ignore the etching.
 */
export function runeCommitment(rune: bigint): Buffer {
  if (rune < 0n || rune >= 1n << 128n) {
    throw new Error(`rune number out of u128 range: ${rune}`);
  }
  const bytes: number[] = [];
  for (let x = rune; x > 0n; x >>= 8n) {
    bytes.push(Number(x & 0xffn));
  }
  return Buffer.from(bytes);
}

/** The spacer ord displays and accepts; `.` is accepted as an alternative. */
const SPACER = "•";

/**
 * Split a spaced rune name such as `SOLSTICE•RECEIPT` into its on-chain name and
 * spacer bitmask (bit `i` set means a spacer after letter `i`).
 */
export function parseSpacedRune(spaced: string): { name: string; spacers: number } {
  let name = "";
  let spacers = 0;
  for (const c of spaced) {
    if (c >= "A" && c <= "Z") {
      name += c;
    } else if (c === SPACER || c === ".") {
      if (name.length === 0) {
        throw new Error(`spaced rune "${spaced}": leading spacer`);
      }
      const flag = 2 ** (name.length - 1);
      if (Math.floor(spacers / flag) % 2 === 1) {
        throw new Error(`spaced rune "${spaced}": double spacer`);
      }
      spacers += flag;
    } else {
      throw new Error(`spaced rune "${spaced}": invalid character "${c}"`);
    }
  }
  if (name.length === 0) {
    throw new Error("rune name must not be empty");
  }
  if (spacers >= 2 ** (name.length - 1)) {
    throw new Error(`spaced rune "${spaced}": trailing spacer`);
  }
  runeNameToNumber(name);
  return { name, spacers };
}

/** Inverse of {@link parseSpacedRune}: render a name with its spacers. */
export function formatSpacedRune(name: string, spacers = 0): string {
  let out = "";
  for (let i = 0; i < name.length; i++) {
    out += name[i];
    if (i < name.length - 1 && Math.floor(spacers / 2 ** i) % 2 === 1) {
      out += SPACER;
    }
  }
  return out;
}
