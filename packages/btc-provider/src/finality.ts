/**
 * Types and checks for a Bitcoin finality proof: a transaction, the proof that
 * a block includes it, and the headers of the blocks mined on top.
 */

import { Block, crypto } from "bitcoinjs-lib";
import * as varuint from "varuint-bitcoin";
import { fromHex, reversedHex } from "./bytes.js";

/** Where a transaction is on the chain, as Esplora's `/tx/:txid/status` reports it. */
export interface TransactionStatus {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

/**
 * What a verifier needs to accept a transaction as final without trusting the
 * provider. This is the shape Charms takes for a Bitcoin finality proof.
 */
export interface FinalityProof {
  /** The raw transaction, hex. */
  tx: string;
  /** Merkle block proof that the transaction is in its block, hex (BIP 37 `merkleblock`). */
  proof: string;
  /** Headers of the blocks after the one that mined the transaction, oldest first, hex. */
  headers: string[];
}

/** A block header is 80 bytes. */
export const HEADER_HEX_LENGTH = 160;

const EARLY_END = "merkle block ends early";

/** A block header, checked to be 80 bytes of hex. */
function parseHeader(headerHex: string): Block {
  assertHeader(headerHex);
  return Block.fromHex(headerHex);
}

function assertHeader(headerHex: string): void {
  if (!/^[0-9a-fA-F]+$/.test(headerHex) || headerHex.length !== HEADER_HEX_LENGTH) {
    throw new Error("A block header is 80 bytes of hex");
  }
}

/** The hash of the block a header belongs to. */
export function blockHashOfHeader(headerHex: string): string {
  return parseHeader(headerHex).getId();
}

/**
 * `varuint.decode` for the two counts in a merkle block, returning the value
 * and the next offset. Only an adapter: the decoding is varuint-bitcoin's. It
 * replaces that library's "Offset is outside the bounds" errors with one
 * naming the merkle block, and turns a count too big for a `number` into the
 * same error.
 */
function readMerkleCount(bytes: Uint8Array, offset: number): [number, number] {
  let decoded: ReturnType<typeof varuint.decode>;
  try {
    decoded = varuint.decode(bytes, offset);
  } catch {
    throw new Error(EARLY_END);
  }
  // A count above 2^53 can't be met by the bytes that follow, so the proof
  // ends before it does.
  if (decoded.numberValue === null) throw new Error(EARLY_END);
  return [decoded.numberValue, offset + decoded.bytes];
}

/**
 * The transactions a merkle block proves are in its block, in block order.
 *
 * Walks the partial merkle tree (BIP 37) the way a node does, rebuilding the
 * root from the hashes the proof carries, and checks that root against the one
 * in the block header at the front. A transaction id that only appears among
 * the proof's hashes, without the tree leading from it to the header's root,
 * is not returned.
 *
 * @throws If the bytes are not a well-formed merkle block, or the tree does not
 * hash to the header's merkle root.
 */
export function merkleBlockTransactions(proofHex: string): string[] {
  const bytes = fromHex(proofHex, "A merkle block is hex");
  const HEADER = HEADER_HEX_LENGTH / 2;
  if (bytes.length < HEADER + 4) throw new Error(EARLY_END);

  const total =
    bytes[HEADER] +
    bytes[HEADER + 1] * 0x100 +
    bytes[HEADER + 2] * 0x10000 +
    bytes[HEADER + 3] * 0x1000000;
  if (total === 0) throw new Error("merkle block has no transactions");

  const [hashCount, hashesAt] = readMerkleCount(bytes, HEADER + 4);
  if (hashCount > total || hashesAt + hashCount * 32 > bytes.length) {
    throw new Error("merkle block has too many hashes");
  }
  const [flagByteCount, flagsAt] = readMerkleCount(bytes, hashesAt + hashCount * 32);
  if (flagsAt + flagByteCount !== bytes.length) {
    throw new Error("merkle block has the wrong length");
  }
  const flagCount = flagByteCount * 8;

  /** Nodes at `height` above the leaves in a block of `total` transactions. */
  const width = (height: number) => Math.ceil(total / 2 ** height);
  let treeHeight = 0;
  while (width(treeHeight) > 1) treeHeight++;

  let flagsUsed = 0;
  let hashesUsed = 0;
  const matches: string[] = [];

  const walk = (height: number, position: number): Uint8Array => {
    if (flagsUsed >= flagCount) throw new Error("merkle block runs out of flags");
    const flag = (bytes[flagsAt + (flagsUsed >> 3)] >> (flagsUsed & 7)) & 1;
    flagsUsed++;

    if (height === 0 || !flag) {
      // A leaf, or a subtree with no match in it: the hash is given.
      if (hashesUsed >= hashCount) throw new Error("merkle block runs out of hashes");
      const at = hashesAt + hashesUsed * 32;
      hashesUsed++;
      const hash = bytes.subarray(at, at + 32);
      if (height === 0 && flag) matches.push(reversedHex(hash));
      return hash;
    }

    const left = walk(height - 1, position * 2);
    let right = left;
    if (position * 2 + 1 < width(height - 1)) {
      right = walk(height - 1, position * 2 + 1);
      // Equal children where both exist is the duplicate-transaction trick
      // (CVE-2012-2459): the same root from a different list of transactions.
      if (left.every((byte, i) => byte === right[i])) {
        throw new Error("merkle block repeats a node");
      }
    }
    const pair = new Uint8Array(64);
    pair.set(left, 0);
    pair.set(right, 32);
    return crypto.hash256(pair);
  };

  const root = walk(treeHeight, 0);
  if (hashesUsed !== hashCount) throw new Error("merkle block has unused hashes");
  // Flags fill whole bytes; only the padding of the last one may go unused.
  if ((flagsUsed + 7) >> 3 !== flagByteCount) {
    throw new Error("merkle block has unused flags");
  }
  // The header's merkle root follows the version and the previous block hash.
  const headerRoot = bytes.subarray(36, 68);
  if (!root.every((byte, i) => byte === headerRoot[i])) {
    throw new Error("merkle block does not hash to its header's merkle root");
  }
  return matches;
}

/**
 * Whether a merkle block proves a transaction is in its block: the block is
 * well formed, its tree hashes to the header's merkle root, and the
 * transaction is among those it matches. A verifier with a stricter rule, such
 * as only the first match counting, applies it to `merkleBlockTransactions`.
 */
export function merkleBlockNames(proofHex: string, txid: string): boolean {
  if (!/^[0-9a-fA-F]{64}$/.test(txid)) return false;
  try {
    return merkleBlockTransactions(proofHex).includes(txid.toLowerCase());
  } catch {
    return false;
  }
}

/** The hash of the block before the one a header belongs to. */
export function previousBlockHashOfHeader(headerHex: string): string {
  const { prevHash } = parseHeader(headerHex);
  // bitcoinjs-lib types it as optional; an 80-byte header always has one.
  if (!prevHash) throw new Error("A block header has no previous block hash");
  return reversedHex(prevHash);
}

// ── Proof of work ────────────────────────────────────────────────────────────

/** The target a compact `bits` value stands for. A hash must not exceed it. */
export function targetOfBits(bits: number): bigint {
  const exponent = bits >>> 24;
  const mantissa = BigInt(bits & 0x007fffff);
  return exponent <= 3
    ? mantissa >> BigInt(8 * (3 - exponent))
    : mantissa << BigInt(8 * (exponent - 3));
}

/** The expected number of hashes to meet a target: 2^256 / (target + 1). */
export function workOfBits(bits: number): bigint {
  return (1n << 256n) / (targetOfBits(bits) + 1n);
}

/** The compact target a header states, from its `bits` field. */
function bitsOfHeader(headerHex: string): number {
  return parseHeader(headerHex).bits;
}

/** The work a header states it took, from its `bits` field. */
export function workOfHeader(headerHex: string): bigint {
  return workOfBits(bitsOfHeader(headerHex));
}

/** Whether a header's hash meets the target the header itself states. */
export function headerMeetsItsTarget(headerHex: string): boolean {
  const target = targetOfBits(bitsOfHeader(headerHex));
  return BigInt("0x" + blockHashOfHeader(headerHex)) <= target;
}
