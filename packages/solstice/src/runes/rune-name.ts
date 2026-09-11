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

/** Encode an A–Z rune name to its `u128` number. */
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
