/**
 * Types and checks for a Bitcoin finality proof: a transaction, the proof that
 * a block includes it, and the headers of the blocks mined on top.
 */

import { sha256 } from "./txid.js";

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

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Hex of `bytes` in reverse order: how block hashes are written. */
function reversedHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = bytes.length - 1; i >= 0; i--) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function assertHeader(headerHex: string): void {
  if (!/^[0-9a-fA-F]+$/.test(headerHex) || headerHex.length !== HEADER_HEX_LENGTH) {
    throw new Error("A block header is 80 bytes of hex");
  }
}

/** The hash of the block a header belongs to. */
export function blockHashOfHeader(headerHex: string): string {
  assertHeader(headerHex);
  return reversedHex(sha256(sha256(fromHex(headerHex))));
}

/**
 * Whether a merkle block names a transaction. The matched transaction's id is
 * one of the hashes the proof carries, in the byte order blocks use.
 */
export function merkleBlockNames(proofHex: string, txid: string): boolean {
  if (!/^[0-9a-fA-F]{64}$/.test(txid)) return false;
  return proofHex.toLowerCase().includes(reversedHex(fromHex(txid)));
}

/** The hash of the block before the one a header belongs to. */
export function previousBlockHashOfHeader(headerHex: string): string {
  assertHeader(headerHex);
  // After the 4-byte version comes the previous block's hash, 32 bytes.
  return reversedHex(fromHex(headerHex.slice(8, 72)));
}
