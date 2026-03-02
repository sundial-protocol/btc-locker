/**
 * Sundial OP_RETURN metadata encoder/decoder
 *
 * Schema (60 bytes total):
 *   4 bytes  — magic ("SD01" or future versions)
 *   1 byte   — version (0x01)
 *   1 byte   — tx_type (1 = deposit, 2 = repayment)
 *  16 bytes  — deposit_id (UUID v4 raw bytes)
 *  32 bytes  — provider_xonly_pubkey
 *   2 bytes  — flags (reserved, default 0x0000)
 *   4 bytes  — CRC-32 checksum (over preceding 56 bytes)
 * ────────────
 *  60 bytes
 */

import { ValidationError } from "../errors";

// ── Constants ────────────────────────────────────────────────────────────────

/** Accepted magic strings (4 ASCII bytes each) */
export const MAGIC_SD01 = "SD01";
const VALID_MAGICS = new Set([MAGIC_SD01]);

/** Current protocol version */
export const METADATA_VERSION = 0x01;

/** Total packed size in bytes */
export const METADATA_LENGTH = 60;

// Field offsets
const OFF_MAGIC = 0;
const OFF_VERSION = 4;
const OFF_TX_TYPE = 5;
const OFF_DEPOSIT_ID = 6;
const OFF_PROVIDER_KEY = 22;
const OFF_FLAGS = 54;
const OFF_CHECKSUM = 56;

// ── Enums / types ────────────────────────────────────────────────────────────

/** Transaction type tag stored in a single byte */
export enum TxType {
  Deposit = 0x01,
  YieldWithdrawal = 0x02,
  Distribution = 0x03,
  UserWithdrawal = 0x04,
}

/** Decoded metadata object returned by {@link unpackMetadata} */
export interface SundialMetadata {
  /** 4-char magic string ("SD01" or future versions) */
  magic: string;
  /** Protocol version byte */
  version: number;
  /** Transaction type */
  txType: TxType;
  /** UUID v4 as canonical string (e.g. "550e8400-e29b-41d4-a716-446655440000") */
  depositId: string;
  /** 32-byte x-only public key as hex (64 hex chars) */
  providerXonlyPubkey: string;
  /** 2-byte flags field */
  flags: number;
}

// ── CRC-32 (IEEE 802.3) ─────────────────────────────────────────────────────

/** Pre-computed CRC-32 lookup table */
const crc32Table: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/** Compute CRC-32 over a Buffer region */
function crc32(buf: Buffer, offset: number, length: number): number {
  let crc = 0xffffffff;
  for (let i = offset; i < offset + length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a canonical UUID string to 16 raw bytes.
 *
 * Accepts formats with or without dashes:
 *  - `"550e8400-e29b-41d4-a716-446655440000"`
 *  - `"550e8400e29b41d4a716446655440000"`
 */
function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32 || !/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new ValidationError(`Invalid UUID: "${uuid}"`);
  }
  return Buffer.from(hex, "hex");
}

/**
 * Convert 16 raw bytes back to canonical UUID string with dashes.
 */
function bytesToUuid(buf: Buffer, offset: number): string {
  const hex = buf.subarray(offset, offset + 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Pack a Sundial metadata payload into a 60-byte Buffer suitable for OP_RETURN.
 *
 * @param opts          - Metadata fields to encode
 * @param opts.magic    - Magic identifier, must be `"SD01"` or some future value (default `"SD01"`)
 * @param opts.txType   - Transaction type (Deposit, YieldWithdrawal, Distribution, UserWithdrawal)
 * @param opts.depositId - UUID v4 string identifying the deposit
 * @param opts.providerXonlyPubkey - 32-byte x-only public key as a 64-char hex string
 * @param opts.flags    - Optional 2-byte flags (default `0x0000`)
 * @returns 60-byte Buffer
 *
 * @example
 * ```ts
 * const buf = packMetadata({
 *   txType: TxType.Deposit,
 *   depositId: "550e8400-e29b-41d4-a716-446655440000",
 *   providerXonlyPubkey: "a1b2c3...64-hex-chars",
 * });
 * ```
 */
export function packMetadata(opts: {
  magic?: string;
  txType: TxType;
  depositId: string;
  providerXonlyPubkey: string;
  flags?: number;
}): Buffer {
  const magic = opts.magic ?? MAGIC_SD01;

  // ── Validate inputs ──────────────────────────────────────────────────────
  if (!VALID_MAGICS.has(magic)) {
    throw new ValidationError(
      `Invalid magic: "${magic}". Must be one of: ${[...VALID_MAGICS].join(", ")}`,
    );
  }

  if (!(opts.txType in TxType)) {
    throw new ValidationError(
      `Invalid txType: ${opts.txType}. Must be a valid TxType value`,
    );
  }

  const depositIdBytes = uuidToBytes(opts.depositId);

  const pubkeyHex = opts.providerXonlyPubkey;
  if (
    pubkeyHex.length !== 64 ||
    !/^[0-9a-fA-F]{64}$/.test(pubkeyHex)
  ) {
    throw new ValidationError(
      `Invalid providerXonlyPubkey: expected 64 hex chars (32 bytes), got ${pubkeyHex.length} chars`,
    );
  }
  const pubkeyBytes = Buffer.from(pubkeyHex, "hex");

  const flags = opts.flags ?? 0x0000;
  if (flags < 0 || flags > 0xffff) {
    throw new ValidationError(
      `Invalid flags: ${flags}. Must be a 16-bit unsigned integer (0–65535)`,
    );
  }

  // ── Build buffer ─────────────────────────────────────────────────────────
  const buf = Buffer.alloc(METADATA_LENGTH);

  // Magic (4 bytes, ASCII)
  buf.write(magic, OFF_MAGIC, 4, "ascii");

  // Version (1 byte)
  buf.writeUInt8(METADATA_VERSION, OFF_VERSION);

  // TxType (1 byte)
  buf.writeUInt8(opts.txType, OFF_TX_TYPE);

  // Deposit ID (16 bytes)
  depositIdBytes.copy(buf, OFF_DEPOSIT_ID);

  // Provider x-only pubkey (32 bytes)
  pubkeyBytes.copy(buf, OFF_PROVIDER_KEY);

  // Flags (2 bytes, big-endian)
  buf.writeUInt16BE(flags, OFF_FLAGS);

  // Checksum (CRC-32 over bytes 0–55)
  const checksum = crc32(buf, 0, OFF_CHECKSUM);
  buf.writeUInt32BE(checksum, OFF_CHECKSUM);

  return buf;
}

/**
 * Unpack a 60-byte Sundial metadata Buffer into its constituent fields.
 *
 * Validates the magic, version, tx_type, and CRC-32 checksum.
 *
 * @param buf - 60-byte Buffer (e.g. from an OP_RETURN output)
 * @returns Decoded {@link SundialMetadata}
 * @throws {ValidationError} on any structural or checksum mismatch
 *
 * @example
 * ```ts
 * const meta = unpackMetadata(opReturnData);
 * console.log(meta.depositId);  // "550e8400-e29b-41d4-a716-446655440000"
 * console.log(meta.txType);     // TxType.Deposit
 * ```
 */
export function unpackMetadata(buf: Buffer): SundialMetadata {
  if (!Buffer.isBuffer(buf)) {
    throw new ValidationError("Expected a Buffer");
  }

  if (buf.length !== METADATA_LENGTH) {
    throw new ValidationError(
      `Invalid metadata length: expected ${METADATA_LENGTH} bytes, got ${buf.length}`,
    );
  }

  // ── Magic ────────────────────────────────────────────────────────────────
  const magic = buf.toString("ascii", OFF_MAGIC, OFF_MAGIC + 4);
  if (!VALID_MAGICS.has(magic)) {
    throw new ValidationError(
      `Unknown magic: "${magic}". Expected one of: ${[...VALID_MAGICS].join(", ")}`,
    );
  }

  // ── Version ──────────────────────────────────────────────────────────────
  const version = buf.readUInt8(OFF_VERSION);
  if (version !== METADATA_VERSION) {
    throw new ValidationError(
      `Unsupported metadata version: ${version}. Expected ${METADATA_VERSION}`,
    );
  }

  // ── TxType ───────────────────────────────────────────────────────────────
  const txType = buf.readUInt8(OFF_TX_TYPE) as TxType;
  if (!(txType in TxType)) {
    throw new ValidationError(
      `Invalid txType: ${txType}. Must be a valid TxType value`,
    );
  }

  // ── Checksum ─────────────────────────────────────────────────────────────
  const storedChecksum = buf.readUInt32BE(OFF_CHECKSUM);
  const computedChecksum = crc32(buf, 0, OFF_CHECKSUM);
  if (storedChecksum !== computedChecksum) {
    throw new ValidationError(
      `Checksum mismatch: stored 0x${storedChecksum.toString(16).padStart(8, "0")}, ` +
        `computed 0x${computedChecksum.toString(16).padStart(8, "0")}`,
    );
  }

  // ── Deposit ID ───────────────────────────────────────────────────────────
  const depositId = bytesToUuid(buf, OFF_DEPOSIT_ID);

  // ── Provider x-only pubkey ───────────────────────────────────────────────
  const providerXonlyPubkey = buf
    .subarray(OFF_PROVIDER_KEY, OFF_PROVIDER_KEY + 32)
    .toString("hex");

  // ── Flags ────────────────────────────────────────────────────────────────
  const flags = buf.readUInt16BE(OFF_FLAGS);

  return {
    magic,
    version,
    txType,
    depositId,
    providerXonlyPubkey,
    flags,
  };
}
