import { describe, test, expect, beforeAll } from "vitest";
import KeyUtils from "../src/utils/keys";
import { ECPairFactory } from "ecpair";
import tinysecp from "@bitcoinerlab/secp256k1";
import * as bitcoin from "bitcoinjs-lib";

describe("KeyUtils", () => {
  let ECPair: ReturnType<typeof ECPairFactory>;
  let validPubKeyHex: string;
  let validPubKeyBuffer: Buffer;
  let validPrivKeyHex: string;
  let validPrivKeyBuffer: Buffer;

  beforeAll(() => {
    const ecc = (tinysecp as any).default || tinysecp;
    bitcoin.initEccLib(ecc);
    ECPair = ECPairFactory(ecc);

    const keyPair = ECPair.makeRandom({ compressed: true });
    validPubKeyHex = keyPair.publicKey.toString("hex");
    validPubKeyBuffer = keyPair.publicKey;
    validPrivKeyHex = keyPair.privateKey!.toString("hex");
    validPrivKeyBuffer = keyPair.privateKey!;
  });

  describe("validateAndConvertPublicKey", () => {
    test("should accept valid hex string public key", () => {
      const result = KeyUtils.validateAndConvertPublicKey(validPubKeyHex);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(33);
    });

    test("should accept valid Buffer public key", () => {
      const result = KeyUtils.validateAndConvertPublicKey(validPubKeyBuffer);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(33);
    });

    test("should throw for null public key", () => {
      expect(() => KeyUtils.validateAndConvertPublicKey(null as any)).toThrow(
        "publicKey cannot be undefined or null",
      );
    });

    test("should throw for undefined public key", () => {
      expect(() =>
        KeyUtils.validateAndConvertPublicKey(undefined as any),
      ).toThrow("publicKey cannot be undefined or null");
    });

    test("should throw for non-hex string", () => {
      expect(() =>
        KeyUtils.validateAndConvertPublicKey("not_hex_string!"),
      ).toThrow("publicKey string must contain only hexadecimal characters");
    });

    test("should throw for invalid type", () => {
      expect(() => KeyUtils.validateAndConvertPublicKey(12345 as any)).toThrow(
        "publicKey must be a string or Buffer",
      );
    });

    test("should throw for wrong length buffer", () => {
      const shortBuffer = Buffer.alloc(10);
      expect(() => KeyUtils.validateAndConvertPublicKey(shortBuffer)).toThrow(
        "Invalid publicKey length: 10",
      );
    });

    test("should use custom param name in error", () => {
      expect(() =>
        KeyUtils.validateAndConvertPublicKey(null as any, "beforePubKey"),
      ).toThrow("beforePubKey cannot be undefined or null");
    });

    test("should accept 65-byte uncompressed public key", () => {
      const uncompressed = Buffer.alloc(65, 0x04);
      const result = KeyUtils.validateAndConvertPublicKey(uncompressed);
      expect(result.length).toBe(65);
    });
  });

  describe("validateAndConvertPrivateKey", () => {
    test("should accept valid hex string private key", () => {
      const result = KeyUtils.validateAndConvertPrivateKey(validPrivKeyHex);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(32);
    });

    test("should accept valid Buffer private key", () => {
      const result = KeyUtils.validateAndConvertPrivateKey(validPrivKeyBuffer);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(32);
    });

    test("should throw for null private key", () => {
      expect(() => KeyUtils.validateAndConvertPrivateKey(null as any)).toThrow(
        "privateKey cannot be undefined or null",
      );
    });

    test("should throw for undefined private key", () => {
      expect(() =>
        KeyUtils.validateAndConvertPrivateKey(undefined as any),
      ).toThrow("privateKey cannot be undefined or null");
    });

    test("should throw for non-hex string", () => {
      expect(() => KeyUtils.validateAndConvertPrivateKey("not_hex!")).toThrow(
        "privateKey string must contain only hexadecimal characters",
      );
    });

    test("should throw for invalid type", () => {
      expect(() => KeyUtils.validateAndConvertPrivateKey(12345 as any)).toThrow(
        "privateKey must be a string or Buffer",
      );
    });

    test("should throw for wrong length buffer", () => {
      const shortBuffer = Buffer.alloc(16);
      expect(() => KeyUtils.validateAndConvertPrivateKey(shortBuffer)).toThrow(
        "Invalid privateKey length: 16. Expected 32 bytes",
      );
    });

    test("should use custom param name in error", () => {
      expect(() =>
        KeyUtils.validateAndConvertPrivateKey(null as any, "signingKey"),
      ).toThrow("signingKey cannot be undefined or null");
    });
  });

  describe("createKeyPair", () => {
    test("should create key pair from hex string", () => {
      const keyPair = KeyUtils.createKeyPair(validPrivKeyHex, ECPair);
      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
    });

    test("should create key pair from Buffer", () => {
      const keyPair = KeyUtils.createKeyPair(validPrivKeyBuffer, ECPair);
      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
    });

    test("should create key pair with network", () => {
      const keyPair = KeyUtils.createKeyPair(
        validPrivKeyHex,
        ECPair,
        bitcoin.networks.testnet,
      );
      expect(keyPair).toBeDefined();
    });

    test("should throw for invalid private key", () => {
      expect(() => KeyUtils.createKeyPair("invalid", ECPair)).toThrow(
        "Failed to create key pair",
      );
    });
  });

  describe("toXOnly", () => {
    test("should convert 66-char hex string to x-only (32 bytes)", () => {
      const result = KeyUtils.toXOnly(validPubKeyHex);
      expect(typeof result).toBe("string");
      expect((result as string).length).toBe(64);
    });

    test("should return shorter string as-is", () => {
      const short = "abcd";
      const result = KeyUtils.toXOnly(short);
      expect(result).toBe(short);
    });

    test("should handle Uint8Array with length != 33", () => {
      const arr = new Uint8Array(65);
      const result = KeyUtils.toXOnly(arr);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(32);
    });

    test("should return 33-byte Uint8Array as-is", () => {
      const arr = new Uint8Array(33);
      const result = KeyUtils.toXOnly(arr);
      expect(result).toBe(arr);
    });
  });
});
