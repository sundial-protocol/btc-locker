import {
  packMetadata,
  unpackMetadata,
  TxType,
  MAGIC_SD01,
  METADATA_VERSION,
  METADATA_LENGTH,
  type SundialMetadata,
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

  describe("packMetadata", () => {
    describe("valid inputs", () => {
      test("should pack deposit metadata with default values", () => {
        const result = packMetadata({
          txType: TxType.Deposit,
          depositId: VALID_UUID,
          providerXonlyPubkey: VALID_PUBKEY,
        });

        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.length).toBe(METADATA_LENGTH);
      });

      test("should pack metadata for all transaction types", () => {
        const txTypes = [
          TxType.Deposit,
          TxType.YieldWithdrawal,
          TxType.Distribution,
          TxType.UserWithdrawal,
        ];

        for (const txType of txTypes) {
          const result = packMetadata({
            txType,
            depositId: VALID_UUID,
            providerXonlyPubkey: VALID_PUBKEY,
          });

          expect(result.length).toBe(METADATA_LENGTH);
        }
      });

      test("should pack metadata with custom magic", () => {
        const result = packMetadata({
          magic: MAGIC_SD01,
          txType: TxType.Deposit,
          depositId: VALID_UUID,
          providerXonlyPubkey: VALID_PUBKEY,
        });

        expect(result.length).toBe(METADATA_LENGTH);
      });

      test("should pack metadata with custom flags", () => {
        const flags = 0x1234;
        const result = packMetadata({
          txType: TxType.Deposit,
          depositId: VALID_UUID,
          providerXonlyPubkey: VALID_PUBKEY,
          flags,
        });

        expect(result.length).toBe(METADATA_LENGTH);
      });

      test("should accept UUID with or without dashes", () => {
        const withDashes = packMetadata({
          txType: TxType.Deposit,
          depositId: VALID_UUID,
          providerXonlyPubkey: VALID_PUBKEY,
        });

        const withoutDashes = packMetadata({
          txType: TxType.Deposit,
          depositId: VALID_UUID_NO_DASHES,
          providerXonlyPubkey: VALID_PUBKEY,
        });

        expect(withDashes).toEqual(withoutDashes);
      });
    });

    describe("invalid inputs", () => {
      test("should throw on invalid magic", () => {
        expect(() =>
          packMetadata({
            magic: "XXXX",
            txType: TxType.Deposit,
            depositId: VALID_UUID,
            providerXonlyPubkey: VALID_PUBKEY,
          })
        ).toThrow(ValidationError);
      });

      test("should throw on invalid txType", () => {
        expect(() =>
          packMetadata({
            txType: 999 as TxType,
            depositId: VALID_UUID,
            providerXonlyPubkey: VALID_PUBKEY,
          })
        ).toThrow(ValidationError);
      });

      test("should throw on invalid UUID", () => {
        expect(() =>
          packMetadata({
            txType: TxType.Deposit,
            depositId: INVALID_UUID,
            providerXonlyPubkey: VALID_PUBKEY,
          })
        ).toThrow(ValidationError);
      });

      test("should throw on short UUID", () => {
        expect(() =>
          packMetadata({
            txType: TxType.Deposit,
            depositId: "550e8400-e29b-41d4-a716-44665544000", // missing 1 char
            providerXonlyPubkey: VALID_PUBKEY,
          })
        ).toThrow(ValidationError);
      });

      test("should throw on invalid pubkey (too short)", () => {
        expect(() =>
          packMetadata({
            txType: TxType.Deposit,
            depositId: VALID_UUID,
            providerXonlyPubkey: INVALID_PUBKEY_SHORT,
          })
        ).toThrow(ValidationError);
      });

      test("should throw on invalid pubkey (too long)", () => {
        expect(() =>
          packMetadata({
            txType: TxType.Deposit,
            depositId: VALID_UUID,
            providerXonlyPubkey: INVALID_PUBKEY_LONG,
          })
        ).toThrow(ValidationError);
      });

      test("should throw on invalid pubkey (non-hex)", () => {
        expect(() =>
          packMetadata({
            txType: TxType.Deposit,
            depositId: VALID_UUID,
            providerXonlyPubkey: "g".repeat(64), // invalid hex
          })
        ).toThrow(ValidationError);
      });

      test("should throw on invalid flags (negative)", () => {
        expect(() =>
          packMetadata({
            txType: TxType.Deposit,
            depositId: VALID_UUID,
            providerXonlyPubkey: VALID_PUBKEY,
            flags: -1,
          })
        ).toThrow(ValidationError);
      });

      test("should throw on invalid flags (too large)", () => {
        expect(() =>
          packMetadata({
            txType: TxType.Deposit,
            depositId: VALID_UUID,
            providerXonlyPubkey: VALID_PUBKEY,
            flags: 0x10000, // > 16-bit max
          })
        ).toThrow(ValidationError);
      });
    });
  });

  describe("unpackMetadata", () => {
    let validPackedMetadata: Buffer;

    beforeEach(() => {
      validPackedMetadata = packMetadata({
        txType: TxType.Deposit,
        depositId: VALID_UUID,
        providerXonlyPubkey: VALID_PUBKEY,
        flags: 0x1234,
      });
    });

    describe("valid inputs", () => {
      test("should unpack valid metadata", () => {
        const result = unpackMetadata(validPackedMetadata);

        expect(result).toEqual({
          magic: MAGIC_SD01,
          version: METADATA_VERSION,
          txType: TxType.Deposit,
          depositId: VALID_UUID,
          providerXonlyPubkey: VALID_PUBKEY,
          flags: 0x1234,
        });
      });

      test("should unpack all transaction types", () => {
        const txTypes = [
          TxType.Deposit,
          TxType.YieldWithdrawal,
          TxType.Distribution,
          TxType.UserWithdrawal,
        ];

        for (const txType of txTypes) {
          const packed = packMetadata({
            txType,
            depositId: VALID_UUID,
            providerXonlyPubkey: VALID_PUBKEY,
          });

          const unpacked = unpackMetadata(packed);
          expect(unpacked.txType).toBe(txType);
        }
      });

      test("should preserve UUID format with dashes", () => {
        const result = unpackMetadata(validPackedMetadata);
        expect(result.depositId).toBe(VALID_UUID);
        expect(result.depositId.includes("-")).toBe(true);
      });
    });

    describe("invalid inputs", () => {
      test("should throw on non-Buffer input", () => {
        expect(() => unpackMetadata("not a buffer" as any)).toThrow(
          ValidationError
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
      const original = {
        magic: MAGIC_SD01,
        txType: TxType.YieldWithdrawal,
        depositId: VALID_UUID,
        providerXonlyPubkey: VALID_PUBKEY,
        flags: 0xabcd,
      };

      const packed = packMetadata(original);
      const unpacked = unpackMetadata(packed);

      expect(unpacked).toEqual({
        ...original,
        version: METADATA_VERSION,
      });
    });

    test("should work with UUID without dashes", () => {
      const original = {
        txType: TxType.Distribution,
        depositId: VALID_UUID_NO_DASHES,
        providerXonlyPubkey: VALID_PUBKEY,
      };

      const packed = packMetadata(original);
      const unpacked = unpackMetadata(packed);

      // Should normalize to dashed format
      expect(unpacked.depositId).toBe(VALID_UUID);
    });

    test("should work with different pubkey values", () => {
      const pubkeys = [
        "0".repeat(64), // all zeros
        "f".repeat(64), // all ones (in hex)
        "0123456789abcdef".repeat(4), // pattern
      ];

      for (const pubkey of pubkeys) {
        const packed = packMetadata({
          txType: TxType.UserWithdrawal,
          depositId: VALID_UUID,
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
          txType: TxType.Deposit,
          depositId: VALID_UUID,
          providerXonlyPubkey: VALID_PUBKEY,
          flags,
        });

        const unpacked = unpackMetadata(packed);
        expect(unpacked.flags).toBe(flags);
      }
    });
  });

  describe("constants", () => {
    test("should export correct constants", () => {
      expect(MAGIC_SD01).toBe("SD01");
      expect(METADATA_VERSION).toBe(0x01);
      expect(METADATA_LENGTH).toBe(60);
    });

    test("TxType enum should have correct values", () => {
      expect(TxType.Deposit).toBe(0x01);
      expect(TxType.YieldWithdrawal).toBe(0x02);
      expect(TxType.Distribution).toBe(0x03);
      expect(TxType.UserWithdrawal).toBe(0x04);
    });
  });

  describe("binary format validation", () => {
    test("should have correct field layout", () => {
      const metadata = {
        txType: TxType.Deposit,
        depositId: VALID_UUID,
        providerXonlyPubkey: VALID_PUBKEY,
        flags: 0x1234,
      };

      const packed = packMetadata(metadata);

      // Check magic (bytes 0-3)
      expect(packed.toString("ascii", 0, 4)).toBe(MAGIC_SD01);

      // Check version (byte 4)
      expect(packed.readUInt8(4)).toBe(METADATA_VERSION);

      // Check txType (byte 5)
      expect(packed.readUInt8(5)).toBe(TxType.Deposit);

      // Check flags (bytes 54-55)
      expect(packed.readUInt16BE(54)).toBe(0x1234);

      // Check total length
      expect(packed.length).toBe(60);
    });

    test("should have valid checksum", () => {
      const packed = packMetadata({
        txType: TxType.Deposit,
        depositId: VALID_UUID,
        providerXonlyPubkey: VALID_PUBKEY,
      });

      // If unpack doesn't throw, checksum is valid
      expect(() => unpackMetadata(packed)).not.toThrow();
    });
  });
});