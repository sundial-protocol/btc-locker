/**
 * Raw script pushes, written without a script compiler.
 *
 * bitcoinjs-lib's `script.compile` applies minimal-push rules: a one-byte push
 * of 1..16 becomes `OP_1`..`OP_16` and 0x81 becomes `OP_1NEGATE`. Runes indexers
 * only read data pushes, so those opcodes are not seen as data. Everything Runes
 * related in this package pushes bytes with {@link pushBytes} instead.
 */

export const OP_PUSHDATA1 = 0x4c;
export const OP_PUSHDATA2 = 0x4d;
export const OP_PUSHDATA4 = 0x4e;

/** A data push, with the length prefix rust-bitcoin's `push_slice` would write. */
export function pushBytes(data: Buffer): Buffer {
  const n = data.length;
  let prefix: Buffer;
  if (n < OP_PUSHDATA1) {
    prefix = Buffer.from([n]);
  } else if (n <= 0xff) {
    prefix = Buffer.from([OP_PUSHDATA1, n]);
  } else if (n <= 0xffff) {
    prefix = Buffer.alloc(3);
    prefix[0] = OP_PUSHDATA2;
    prefix.writeUInt16LE(n, 1);
  } else {
    prefix = Buffer.alloc(5);
    prefix[0] = OP_PUSHDATA4;
    prefix.writeUInt32LE(n, 1);
  }
  return Buffer.concat([prefix, data]);
}
