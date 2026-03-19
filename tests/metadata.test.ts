import { describe, test, expect, beforeEach } from "vitest";
import MetadataUtils, {
  packMetadata,
  unpackMetadata,
  TxType,
  MAGIC_SNDL,
  METADATA_VERSION,
  METADATA_LENGTH,
} from "../src/utils/metadata";
import { ValidationError } from "../src/errors";

describe("Sundial Metadata", () => {
  // Test constants
  const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
  const VALID_UUID_NO_DASHES = "550e8400e29b41d4a716446655440000";
  const VALID_PUBKEY = "a".repeat(64); // 32 bytes as hex string
  const INVALID_PUBKEY_SHORT = "a".repeat(63);
  const INVALID_PUBKEY_LONG = "a".repeat(65);
  const INVALID_UUID = "invalid-uuid";
  const MAGIC_SNDL = "SNDL";
  const METADATA_VERSION = 0x01;
  const METADATA_FLAGS = 0x1234;

  const BASE_METADATA = {
    magic: MAGIC_SNDL,
    version: METADATA_VERSION,
    txType: TxType.Deposit,
    subjectId: VALID_UUID,
    providerXonlyPubkey: VALID_PUBKEY,
    flags: METADATA_FLAGS,
  };

  describe("MetadataUtils class", () => {
    describe("pack method", () => {
      test("should pack deposit metadata with default values", () => {
        const result = MetadataUtils.pack(BASE_METADATA);

        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.length).toBe(METADATA_LENGTH);
      });

      test("should have static constants", () => {
        expect(MetadataUtils.MAGIC_SNDL).toBe(MAGIC_SNDL);
        expect(MetadataUtils.METADATA_VERSION).toBe(METADATA_VERSION);
        expect(MetadataUtils.METADATA_LENGTH).toBe(METADATA_LENGTH);
        expect(MetadataUtils.TxType).toBe(TxType);
      });
    });

    describe("unpack method", () => {
      test("should unpack valid metadata", () => {
        const packed = MetadataUtils.pack(BASE_METADATA);

        const result = MetadataUtils.unpack(packed);

        expect(result).toEqual(BASE_METADATA);
      });
    });
  });

  describe("Legacy function compatibility", () => {
    describe("packMetadata", () => {
      describe("valid inputs", () => {
        test("should pack deposit metadata with default values", () => {
          const result = packMetadata(BASE_METADATA);

          expect(Buffer.isBuffer(result)).toBe(true);
          expect(result.length).toBe(METADATA_LENGTH);
        });

        test("should pack metadata for all transaction types", () => {
          const txTypes = [
            TxType.Deposit,
            TxType.Claim,
            TxType.Distribution,
            TxType.Withdrawal,
          ];

          for (const txType of txTypes) {
            const result = packMetadata({
              ...BASE_METADATA,
              txType,
            });

            expect(result.length).toBe(METADATA_LENGTH);
          }
        });

        test("should pack metadata with custom magic", () => {
          const result = packMetadata(BASE_METADATA);

          expect(result.length).toBe(METADATA_LENGTH);
        });

        test("should pack metadata with custom flags", () => {
          const flags = 0x1114;
          const result = packMetadata({
            ...BASE_METADATA,
            flags,
          });

          expect(result.length).toBe(METADATA_LENGTH);
        });
      });

      describe("invalid inputs", () => {
        test("should throw on invalid magic", () => {
          expect(() =>
            packMetadata({
              ...BASE_METADATA,
              magic: "XXXX",
            }),
          ).toThrow(ValidationError);
        });

        test("should throw on invalid txType", () => {
          expect(() =>
            packMetadata({
              ...BASE_METADATA,
              txType: 999 as TxType,
            }),
          ).toThrow(ValidationError);
        });

        test("should throw on invalid UUID", () => {
          expect(() =>
            packMetadata({
              ...BASE_METADATA,
              subjectId: INVALID_UUID,
            }),
          ).toThrow(TypeError);
        });

        test("should throw on short UUID", () => {
          expect(() =>
            packMetadata({
              ...BASE_METADATA,
              subjectId: "550e8400-e29b-41d4-a716-44665544000", // missing 1 char
            }),
          ).toThrow(TypeError);
        });

        test("should throw on invalid pubkey (too short)", () => {
          expect(() =>
            packMetadata({
              ...BASE_METADATA,
              providerXonlyPubkey: INVALID_PUBKEY_SHORT,
            }),
          ).toThrow(ValidationError);
        });

        test("should throw on invalid pubkey (too long)", () => {
          expect(() =>
            packMetadata({
              ...BASE_METADATA,
              providerXonlyPubkey: INVALID_PUBKEY_LONG,
            }),
          ).toThrow(ValidationError);
        });

        test("should throw on invalid pubkey (non-hex)", () => {
          expect(() =>
            packMetadata({
              ...BASE_METADATA,
              providerXonlyPubkey: "g".repeat(64), // invalid hex
            }),
          ).toThrow(ValidationError);
        });

        test("should throw on invalid flags (negative)", () => {
          expect(() =>
            packMetadata({
              ...BASE_METADATA,
              flags: -1,
            }),
          ).toThrow(ValidationError);
        });

        test("should throw on invalid flags (too large)", () => {
          expect(() =>
            packMetadata({
              ...BASE_METADATA,
              flags: 0x10000, // > 16-bit max
            }),
          ).toThrow(ValidationError);
        });
      });
    });
  });

  describe("unpackMetadata", () => {
    let validPackedMetadata: Buffer;

    beforeEach(() => {
      validPackedMetadata = packMetadata(BASE_METADATA);
    });

    describe("valid inputs", () => {
      test("should unpack valid metadata", () => {
        const result = unpackMetadata(validPackedMetadata);

        expect(result).toEqual({
          magic: MAGIC_SNDL,
          version: METADATA_VERSION,
          txType: TxType.Deposit,
          subjectId: VALID_UUID,
          providerXonlyPubkey: VALID_PUBKEY,
          flags: 0x1234,
        });
      });

      test("should unpack all transaction types", () => {
        const txTypes = [
          TxType.Deposit,
          TxType.Claim,
          TxType.Distribution,
          TxType.Withdrawal,
        ];

        for (const txType of txTypes) {
          const packed = packMetadata({
            ...BASE_METADATA,
            txType,
          });

          const unpacked = unpackMetadata(packed);
          expect(unpacked.txType).toBe(txType);
        }
      });

      test("should preserve UUID format with dashes", () => {
        const result = unpackMetadata(validPackedMetadata);
        expect(result.subjectId).toBe(VALID_UUID);
        expect(result.subjectId.includes("-")).toBe(true);
      });
    });

    describe("invalid inputs", () => {
      test("should throw on non-Buffer input", () => {
        expect(() => unpackMetadata("not a buffer" as any)).toThrow(
          ValidationError,
        );
      });

      test("should throw on wrong length buffer", () => {
        const wrongSizeBuffer = Buffer.alloc(59); // 1 byte short
        expect(() => unpackMetadata(wrongSizeBuffer)).toThrow(ValidationError);
      });

      test("should throw on invalid magic", () => {
        const corrupted = Buffer.from(validPackedMetadata);
        corrupted.write("XXXX", 0, 4); // corrupt magic
        expect(() => unpackMetadata(corrupted)).toThrow(ValidationError);
      });

      test("should throw on invalid version", () => {
        const corrupted = Buffer.from(validPackedMetadata);
        corrupted.writeUInt8(0x99, 4); // corrupt version
        expect(() => unpackMetadata(corrupted)).toThrow(ValidationError);
      });

      test("should throw on invalid txType", () => {
        const corrupted = Buffer.from(validPackedMetadata);
        corrupted.writeUInt8(0x99, 5); // corrupt txType
        expect(() => unpackMetadata(corrupted)).toThrow(ValidationError);
      });

      test("should throw on invalid checksum", () => {
        const corrupted = Buffer.from(validPackedMetadata);
        // Corrupt the last 4 bytes (checksum)
        corrupted.writeUInt32BE(0x12345678, 56);
        expect(() => unpackMetadata(corrupted)).toThrow(ValidationError);
      });

      test("should throw on corrupted data (checksum mismatch)", () => {
        const corrupted = Buffer.from(validPackedMetadata);
        // Corrupt some middle data but leave checksum intact
        corrupted[30] = corrupted[30] ^ 0xff;
        expect(() => unpackMetadata(corrupted)).toThrow(ValidationError);
      });
    });
  });

  describe("round-trip tests", () => {
    test("should preserve all fields through pack/unpack cycle", () => {
      const packed = packMetadata(BASE_METADATA);
      const unpacked = unpackMetadata(packed);

      expect(unpacked).toEqual(BASE_METADATA);
    });

    test("should work with different pubkey values", () => {
      const pubkeys = [
        "0".repeat(64), // all zeros
        "f".repeat(64), // all ones (in hex)
        "0123456789abcdef".repeat(4), // pattern
      ];

      for (const pubkey of pubkeys) {
        const packed = packMetadata({
          ...BASE_METADATA,
          providerXonlyPubkey: pubkey,
        });

        const unpacked = unpackMetadata(packed);
        expect(unpacked.providerXonlyPubkey).toBe(pubkey);
      }
    });

    test("should work with edge case flag values", () => {
      const flagValues = [0x0000, 0x0001, 0xffff, 0x5555, 0xaaaa];

      for (const flags of flagValues) {
        const packed = packMetadata({
          ...BASE_METADATA,
          flags,
        });

        const unpacked = unpackMetadata(packed);
        expect(unpacked.flags).toBe(flags);
      }
    });
  });

  describe("pack_string validation", () => {
    describe("JSON string input", () => {
      test("should pack valid JSON metadata string", () => {
        const metadataObj = {
          txType: TxType.Deposit,
          subjectId: VALID_UUID,
          providerXonlyPubkey: VALID_PUBKEY,
          flags: 0x1234,
        };
        const jsonString = JSON.stringify(metadataObj);

        const result = MetadataUtils.pack_string(jsonString);

        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.length).toBe(METADATA_LENGTH);

        // Verify it can be unpacked correctly
        const unpacked = MetadataUtils.unpack(result);
        expect(unpacked.txType).toBe(TxType.Deposit);
        expect(unpacked.subjectId).toBe(VALID_UUID);
        expect(unpacked.providerXonlyPubkey).toBe(VALID_PUBKEY);
        expect(unpacked.flags).toBe(0x1234);
      });

      test("should pack JSON with minimal required fields", () => {
        const metadataObj = {
          txType: TxType.Claim,
          subjectId: VALID_UUID,
          providerXonlyPubkey: VALID_PUBKEY,
        };
        const jsonString = JSON.stringify(metadataObj);

        const result = MetadataUtils.pack_string(jsonString);
        const unpacked = MetadataUtils.unpack(result);

        expect(unpacked.magic).toBe(MAGIC_SNDL);
        expect(unpacked.version).toBe(METADATA_VERSION);
        expect(unpacked.flags).toBe(0);
      });

      test("should throw on missing required fields", () => {
        const invalidMetadata = {
          txType: TxType.Deposit,
          subjectId: VALID_UUID,
          // missing providerXonlyPubkey
        };
        const jsonString = JSON.stringify(invalidMetadata);

        expect(() => MetadataUtils.pack_string(jsonString)).toThrow(
          ValidationError,
        );
      });

      test("should throw on invalid JSON metadata", () => {
        const invalidMetadata = {
          txType: 999, // invalid
          subjectId: VALID_UUID,
          providerXonlyPubkey: VALID_PUBKEY,
        };
        const jsonString = JSON.stringify(invalidMetadata);

        expect(() => MetadataUtils.pack_string(jsonString)).toThrow(
          ValidationError,
        );
      });
    });

    describe("hex string input", () => {
      test("should pack valid hex metadata string", () => {
        // First create valid packed metadata
        const originalPacked = MetadataUtils.pack(BASE_METADATA);
        const hexString = originalPacked.toString("hex");

        const result = MetadataUtils.pack_string(hexString);

        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.length).toBe(METADATA_LENGTH);
        expect(result).toEqual(originalPacked);
      });

      test("should throw on invalid hex string length", () => {
        const shortHexString = "a".repeat(118); // 118 chars instead of 120

        expect(() => MetadataUtils.pack_string(shortHexString)).toThrow(
          ValidationError,
        );
        expect(() => MetadataUtils.pack_string(shortHexString)).toThrow(
          /Invalid hex string length/,
        );
      });

      test("should throw on invalid hex metadata", () => {
        // Create 120 character hex string but with invalid content
        const invalidHex = "FF".repeat(60); // All 0xFF bytes won't have valid checksum

        expect(() => MetadataUtils.pack_string(invalidHex)).toThrow(
          ValidationError,
        );
      });

      test("should handle uppercase and lowercase hex", () => {
        const originalPacked = MetadataUtils.pack(BASE_METADATA);

        const upperHex = originalPacked.toString("hex").toUpperCase();
        const lowerHex = originalPacked.toString("hex").toLowerCase();

        const resultUpper = MetadataUtils.pack_string(upperHex);
        const resultLower = MetadataUtils.pack_string(lowerHex);

        expect(resultUpper).toEqual(originalPacked);
        expect(resultLower).toEqual(originalPacked);
      });
    });

    describe("invalid input types", () => {
      test("should throw on non-string input", () => {
        expect(() => MetadataUtils.pack_string(123 as any)).toThrow(
          ValidationError,
        );
        expect(() => MetadataUtils.pack_string(null as any)).toThrow(
          ValidationError,
        );
        expect(() => MetadataUtils.pack_string(undefined as any)).toThrow(
          ValidationError,
        );
        expect(() => MetadataUtils.pack_string({} as any)).toThrow(
          ValidationError,
        );
      });

      test("should throw on invalid JSON string", () => {
        const invalidJson = "{ invalid json }";

        expect(() => MetadataUtils.pack_string(invalidJson)).toThrow(
          ValidationError,
        );
      });

      test("should throw on non-hex, non-JSON string", () => {
        const randomString = "this is just a random string";

        expect(() => MetadataUtils.pack_string(randomString)).toThrow(
          ValidationError,
        );
        expect(() => MetadataUtils.pack_string(randomString)).toThrow(
          /must be either valid JSON/,
        );
      });

      test("should throw on hex string with invalid characters", () => {
        const invalidHex = "G".repeat(120); // G is not a valid hex character

        expect(() => MetadataUtils.pack_string(invalidHex)).toThrow(
          ValidationError,
        );
      });
    });

    describe("toOutput with string", () => {
      test("should create OP_RETURN output from JSON string", () => {
        const metadataObj = {
          txType: TxType.Deposit,
          subjectId: VALID_UUID,
          providerXonlyPubkey: VALID_PUBKEY,
        };
        const jsonString = JSON.stringify(metadataObj);

        const output = MetadataUtils.toOutput(jsonString);

        expect(output.value).toBe(BigInt(0));
        expect(Buffer.isBuffer(output.script)).toBe(true);
      });

      test("should create OP_RETURN output from hex string", () => {
        const originalPacked = MetadataUtils.pack(BASE_METADATA);
        const hexString = originalPacked.toString("hex");

        const output = MetadataUtils.toOutput(hexString);

        expect(output.value).toBe(BigInt(0));
        expect(Buffer.isBuffer(output.script)).toBe(true);
      });
    });
  });

  describe("constants", () => {
    test("should export correct constants", () => {
      expect(MAGIC_SNDL).toBe("SNDL");
      expect(METADATA_VERSION).toBe(0x01);
      expect(METADATA_LENGTH).toBe(60);
    });

    test("TxType enum should have correct values", () => {
      expect(TxType.Deposit).toBe(0x01);
      expect(TxType.Claim).toBe(0x02);
      expect(TxType.Distribution).toBe(0x03);
      expect(TxType.Withdrawal).toBe(0x04);
    });
  });

  describe("binary format validation", () => {
    test("should have correct field layout", () => {
      const packed = packMetadata(BASE_METADATA);

      // Check magic (bytes 0-3)
      expect(packed.toString("ascii", 0, 4)).toBe(MAGIC_SNDL);

      // Check version (byte 4)
      expect(packed.readUInt8(4)).toBe(METADATA_VERSION);

      // Check txType (byte 5)
      expect(packed.readUInt8(5)).toBe(BASE_METADATA.txType);

      // Check flags (bytes 54-55)
      expect(packed.readUInt16BE(54)).toBe(BASE_METADATA.flags);

      // Check total length
      expect(packed.length).toBe(60);
    });

    test("should have valid checksum", () => {
      const packed = packMetadata(BASE_METADATA);

      // If unpack doesn't throw, checksum is valid
      expect(() => unpackMetadata(packed)).not.toThrow();
    });
  });
});
