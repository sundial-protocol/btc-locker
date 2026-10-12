/**
 * Raw script pushes, written without a script compiler.
 *
 * bitcoinjs-lib's `script.compile` applies minimal-push rules: a one-byte push
 * of 1..16 becomes `OP_1`..`OP_16` and 0x81 becomes `OP_1NEGATE`. Runes indexers
 * only read data pushes, so those opcodes are not seen as data. Everything Runes
 * related in this package pushes bytes with {@link pushBytes} instead.
 */

import { concatBytes } from "./bytes.js";

export const OP_PUSHDATA1 = 0x4c;
export const OP_PUSHDATA2 = 0x4d;
export const OP_PUSHDATA4 = 0x4e;

/** A data push, with the length prefix rust-bitcoin's `push_slice` would write. */
export function pushBytes(data: Uint8Array): Uint8Array {
  const n = data.length;
  let prefix: number[];
  if (n < OP_PUSHDATA1) {
    prefix = [n];
  } else if (n <= 0xff) {
    prefix = [OP_PUSHDATA1, n];
  } else if (n <= 0xffff) {
    prefix = [OP_PUSHDATA2, n & 0xff, n >>> 8];
  } else {
    prefix = [OP_PUSHDATA4, n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, n >>> 24];
  }
  return concatBytes([Uint8Array.from(prefix), data]);
}
