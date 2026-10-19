/**
 * Hex helpers shared by the transaction id and finality-proof code.
 */

/**
 * The bytes of a hex string.
 *
 * Kept here instead of using a library because it rejects bad input. The hex
 * decoder bitcoinjs-lib uses, `uint8array-tools`' `fromHex`, does not: it
 * decodes `"zz"` and `"0g12"` to an empty array and `"abc"` to one byte,
 * dropping the last digit, with no error. Hex here comes from a provider's
 * response or a caller, and a finality proof that decoded to the wrong bytes
 * would fail later with a misleading message, or not at all. A mangled header
 * or merkle block must be an error at the point it is read. `invalid` lets each
 * caller say what was not hex.
 *
 * @throws `invalid` as the error message if `hex` is not an even number of hex digits.
 */
export function fromHex(hex: string, invalid = "Not valid hex"): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error(invalid);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Hex of `bytes` in reverse order: how transaction ids and block hashes are written. */
export function reversedHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = bytes.length - 1; i >= 0; i--) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
