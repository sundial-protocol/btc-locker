/**
 * Sundial OP_RETURN metadata encoder/decoder
 *
 * Schema (60 bytes total):
 *   4 bytes  — magic ("SNDL" or future versions)
 *   1 byte   — version (0x01)
 *   1 byte   — tx_type (1 = deposit, 2 = repayment)
 *  16 bytes  — deposit_id (UUID v4 raw bytes)
 *  32 bytes  — provider_xonly_pubkey
 *   2 bytes  — flags (reserved, default 0x0000)
 *   4 bytes  — CRC-32 checksum (over preceding 56 bytes)
 * ────────────
 *  60 bytes
 */

import { ValidationError } from "../errors.js";
import { TxOutput } from "bitcoinjs-lib";
import * as bitcoin from "bitcoinjs-lib";
import { parse, stringify } from "uuid";

// ── Constants ────────────────────────────────────────────────────────────────

/** Accepted magic strings (4 ASCII bytes each) */
export const MAGIC_SNDL = "SNDL";
const VALID_MAGICS = new Set([MAGIC_SNDL]);

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
  Claim = 0x02,
  Distribution = 0x03,
  Withdrawal = 0x04,
}

/** Decoded metadata object returned by {@link unpackMetadata} */
export interface SundialMetadata {
  /** 4-char magic string ("SNDL" or future versions) */
  magic: string;
  /** Protocol version byte */
  version: number;
  /** Transaction type */
  txType: TxType;
  /** UUID v4 as canonical string (e.g. "550e8400-e29b-41d4-a716-446655440000") */
  subjectId: string;
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

/**
 * Compute CRC-32 (IEEE 802.3) checksum over a Buffer region
 * @param buf - Buffer to compute checksum over
 * @param offset - Starting byte offset
 * @param length - Number of bytes to include
 * @returns CRC-32 checksum as unsigned 32-bit integer
 */
function crc32(buf: Buffer, offset: number, length: number): number {
  let crc = 0xffffffff;
  for (let i = offset; i < offset + length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Metadata Utils Class ─────────────────────────────────────────────────────

/**
 * Sundial metadata utilities for OP_RETURN encoding/decoding
 */
export default class MetadataUtils {
  // Export constants as static properties
  static readonly MAGIC_SNDL = MAGIC_SNDL;
  static readonly METADATA_VERSION = METADATA_VERSION;
  static readonly METADATA_LENGTH = METADATA_LENGTH;
  static readonly TxType = TxType;

  /**
   * Pack a Sundial metadata payload into a 60-byte Buffer suitable for OP_RETURN.
   *
   * @param opts          - Metadata fields to encode
   * @param opts.magic    - Magic identifier, must be `"SNDL"` or some future value (default `"SNDL"`)
   * @param opts.txType   - Transaction type (Deposit, Claim, Distribution, Withdrawal)
   * @param opts.subjectId - UUID v4 string identifying the deposit
   * @param opts.providerXonlyPubkey - 32-byte x-only public key as a 64-char hex string
   * @param opts.flags    - Optional 2-byte flags (default `0x0000`)
   * @returns 60-byte Buffer
   *
   * @example
   * ```ts
   * const buf = MetadataUtils.pack({
   *   txType: MetadataUtils.TxType.Deposit,
   *   subjectId: "550e8400-e29b-41d4-a716-446655440000",
   *   providerXonlyPubkey: "a1b2c3...64-hex-chars",
   * });
   * ```
   */
  static pack(opts: SundialMetadata): Buffer {
    const magic = opts.magic ?? MAGIC_SNDL;

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

    const subjectIdBytes = Buffer.from(parse(opts.subjectId));

    const pubkeyHex = opts.providerXonlyPubkey;
    if (pubkeyHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(pubkeyHex)) {
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
    subjectIdBytes.copy(buf, OFF_DEPOSIT_ID);

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
   * const meta = MetadataUtils.unpack(opReturnData);
   * console.log(meta.subjectId);  // "550e8400-e29b-41d4-a716-446655440000"
   * console.log(meta.txType);     // TxType.Deposit
   * ```
   */
  static unpack(buf: Buffer): SundialMetadata {
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
    const subjectId = stringify(buf, OFF_DEPOSIT_ID);

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
      subjectId,
      providerXonlyPubkey,
      flags,
    };
  }

  /**
   * Pack a string into a Buffer with validation to ensure it matches the Sundial metadata schema.
   *
   * Accepts either:
   * - JSON string representing a SundialMetadata object
   * - Hex string representing 60-byte packed metadata
   *
   * @param s - String to validate and pack
   * @returns Buffer containing the validated metadata
   * @throws {ValidationError} if the string doesn't match the expected schema
   *
   * @example
   * ```ts
   * // JSON string
   * const jsonStr = JSON.stringify({
   *   magic: "SNDL",
   *   version: 1,
   *   txType: 1,
   *   subjectId: "550e8400-e29b-41d4-a716-446655440000",
   *   providerXonlyPubkey: "a".repeat(64),
   *   flags: 0
   * });
   * const buffer = MetadataUtils.pack_string(jsonStr);
   *
   * // Hex string (60 bytes)
   * const hexStr = "SNDL010100..."; // 60-byte hex string
   * const buffer2 = MetadataUtils.pack_string(hexStr);
   * ```
   */
  static pack_string(s: string): Buffer {
    if (typeof s !== "string") {
      throw new ValidationError("Input must be a string");
    }

    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(s);

      // Validate it's a SundialMetadata object
      if (typeof parsed === "object" && parsed !== null) {
        // Check required fields exist
        const requiredFields = ["txType", "subjectId", "providerXonlyPubkey"];
        for (const field of requiredFields) {
          if (!(field in parsed)) {
            throw new ValidationError(`Missing required field: ${field}`);
          }
        }

        // Set defaults for optional fields if not present
        const metadata: SundialMetadata = {
          magic: parsed.magic || MAGIC_SNDL,
          version: parsed.version || METADATA_VERSION,
          txType: parsed.txType,
          subjectId: parsed.subjectId,
          providerXonlyPubkey: parsed.providerXonlyPubkey,
          flags: parsed.flags || 0,
        };

        // Use the pack method to validate and create buffer
        return MetadataUtils.pack(metadata);
      }
    } catch {
      // If JSON parsing fails, try hex parsing

      // Check if it's a valid hex string
      if (/^[0-9a-fA-F]+$/.test(s)) {
        // Ensure it's the correct length (120 hex chars = 60 bytes)
        if (s.length !== METADATA_LENGTH * 2) {
          throw new ValidationError(
            `Invalid hex string length: expected ${METADATA_LENGTH * 2} characters (${METADATA_LENGTH} bytes), got ${s.length}`,
          );
        }

        const buffer = Buffer.from(s, "hex");

        // Validate the hex data by trying to unpack it
        try {
          MetadataUtils.unpack(buffer);
          return buffer;
        } catch (unpackError) {
          throw new ValidationError(
            `Invalid metadata hex string: ${(unpackError as Error).message}`,
          );
        }
      }

      // If neither JSON nor hex parsing worked, throw error
      throw new ValidationError(
        "String must be either valid JSON representing SundialMetadata or a valid 120-character hex string representing packed metadata",
      );
    }

    return Buffer.from(s, "utf8");
  }

  /**
   * Quick check whether a buffer looks like Sundial metadata by testing the
   * magic bytes only. Does not validate the checksum or any other field.
   * Use {@link unpack} after this returns `true` to fully validate and decode.
   */
  static isSundialMetadata(buf: Buffer | Uint8Array): boolean {
    if (!buf || buf.length < OFF_MAGIC + 4) return false;
    return VALID_MAGICS.has(
      Buffer.from(buf.buffer, buf.byteOffset + OFF_MAGIC, 4).toString("ascii"),
    );
  }

  /**
   * Create an OP_RETURN transaction output containing packed Sundial metadata.
   * @param metadata - Metadata object or JSON/hex string to pack
   * @returns Transaction output with OP_RETURN script and zero value
   */
  static toOutput(metadata: SundialMetadata | string): TxOutput {
    const metadataBuffer =
      typeof metadata === "string"
        ? this.pack_string(metadata)
        : this.pack(metadata);
    const opReturnScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_RETURN,
      metadataBuffer,
    ]);
    return {
      script: Buffer.from(opReturnScript),
      value: BigInt(0),
    };
  }

  // Legacy function aliases for backward compatibility
  static packMetadata = MetadataUtils.pack;
  static unpackMetadata = MetadataUtils.unpack;
}

// Export legacy functions for backward compatibility
export const packMetadata = MetadataUtils.pack;
export const unpackMetadata = MetadataUtils.unpack;
