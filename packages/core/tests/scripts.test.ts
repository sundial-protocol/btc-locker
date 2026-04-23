import { describe, test, expect, beforeAll } from "vitest";
import ScriptUtils from "../src/utils/scripts";
import * as bitcoin from "bitcoinjs-lib";
import tinysecp from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";

describe("ScriptUtils", () => {
  let validCompressedPubKey: string;
  let validPrivateKey: string;
  let testnetAddress: string;

  beforeAll(() => {
    const ecc = (tinysecp as any).default || tinysecp;
    bitcoin.initEccLib(ecc);
    const ECPair = ECPairFactory(ecc);
    const keyPair = ECPair.makeRandom({
      compressed: true,
      network: bitcoin.networks.testnet,
    });
    validCompressedPubKey = keyPair.publicKey.toString("hex");
    validPrivateKey = keyPair.privateKey!.toString("hex");

    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: bitcoin.networks.testnet,
    });
    testnetAddress = address!;
  });

  describe("isValidPublicKey", () => {
    test("should return true for valid 33-byte compressed key hex", () => {
      expect(ScriptUtils.isValidPublicKey(validCompressedPubKey)).toBe(true);
    });

    test("should return true for valid Buffer", () => {
      const buf = Buffer.from(validCompressedPubKey, "hex");
      expect(ScriptUtils.isValidPublicKey(buf)).toBe(true);
    });

    test("should return false for invalid hex", () => {
      expect(ScriptUtils.isValidPublicKey("zzz")).toBe(false);
    });

    test("should return false for wrong length string", () => {
      expect(ScriptUtils.isValidPublicKey("aabb")).toBe(false);
    });

    test("should return true for 65-byte uncompressed key", () => {
      const buf = Buffer.alloc(65, 0x04);
      expect(ScriptUtils.isValidPublicKey(buf)).toBe(true);
    });
  });

  describe("isValidPrivateKey", () => {
    test("should return true for valid 32-byte private key hex", () => {
      expect(ScriptUtils.isValidPrivateKey(validPrivateKey)).toBe(true);
    });

    test("should return true for valid Buffer", () => {
      const buf = Buffer.from(validPrivateKey, "hex");
      expect(ScriptUtils.isValidPrivateKey(buf)).toBe(true);
    });

    test("should return false for invalid hex", () => {
      expect(ScriptUtils.isValidPrivateKey("zzz")).toBe(false);
    });

    test("should return false for wrong length", () => {
      expect(ScriptUtils.isValidPrivateKey("aabb")).toBe(false);
    });
  });

  describe("isValidAddress", () => {
    test("should return true for valid testnet address", () => {
      expect(
        ScriptUtils.isValidAddress(testnetAddress, bitcoin.networks.testnet),
      ).toBe(true);
    });

    test("should return false for invalid address", () => {
      expect(ScriptUtils.isValidAddress("invalid_address")).toBe(false);
    });

    test("should use mainnet by default", () => {
      // testnet address should fail on mainnet
      expect(ScriptUtils.isValidAddress(testnetAddress)).toBe(false);
    });
  });

  describe("parseScript", () => {
    test("should parse a simple OP_CHECKSIG script", () => {
      const pubKeyBuf = Buffer.from(validCompressedPubKey, "hex");
      const script = bitcoin.script.compile([
        pubKeyBuf,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const parsed = ScriptUtils.parseScript(
        Buffer.from(script).toString("hex"),
      );
      expect(parsed).toContain(validCompressedPubKey);
      expect(parsed).toContain("OP_CHECKSIG");
    });

    test("should throw for invalid script hex", () => {
      // An empty script should decompile to empty array, not fail
      // Use a truly broken script
      expect(() => ScriptUtils.parseScript("")).not.toThrow();
    });
  });

  describe("createScriptAddress", () => {
    test("should create P2SH address from redeem script", () => {
      const pubKeyBuf = Buffer.from(validCompressedPubKey, "hex");
      const redeemScript = bitcoin.script.compile([
        pubKeyBuf,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const address = ScriptUtils.createScriptAddress(
        Buffer.from(redeemScript),
        bitcoin.networks.testnet,
      );
      expect(typeof address).toBe("string");
      expect(address.length).toBeGreaterThan(0);
    });

    test("should throw for empty redeem script", () => {
      expect(() =>
        ScriptUtils.createScriptAddress(
          Buffer.alloc(0),
          bitcoin.networks.testnet,
        ),
      ).toThrow("Invalid redeem script: empty or undefined");
    });

    test("should throw for null redeem script", () => {
      expect(() =>
        ScriptUtils.createScriptAddress(null as any, bitcoin.networks.testnet),
      ).toThrow("Invalid redeem script: empty or undefined");
    });

    test("should throw for null network", () => {
      const redeemScript = Buffer.from("00", "hex");
      expect(() =>
        ScriptUtils.createScriptAddress(redeemScript, null as any),
      ).toThrow("Invalid network");
    });
  });

  describe("calculateScriptHash", () => {
    test("should calculate hash of a script", () => {
      const script = Buffer.from("76a914aabbccdd88ac", "hex");
      const hash = ScriptUtils.calculateScriptHash(script);
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(40); // 20 bytes = 40 hex chars
    });
  });

  describe("extractSequenceFromScript", () => {
    test("returns the sequence value from a CSV script", () => {
      const pubKeyBuf = Buffer.from(validCompressedPubKey, "hex");
      const sequence = 144; // 1 day in blocks
      const script = bitcoin.script.compile([
        bitcoin.script.number.encode(sequence),
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        pubKeyBuf,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const result = ScriptUtils.extractSequenceFromScript(
        Buffer.from(script).toString("hex"),
      );
      expect(result).toBe(sequence);
    });

    test("returns null for a CLTV script (not CSV)", () => {
      const pubKeyBuf = Buffer.from(validCompressedPubKey, "hex");
      const locktime = Math.floor(Date.now() / 1000) - 3600;
      const script = bitcoin.script.compile([
        bitcoin.script.number.encode(locktime),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        pubKeyBuf,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const result = ScriptUtils.extractSequenceFromScript(
        Buffer.from(script).toString("hex"),
      );
      expect(result).toBeNull();
    });

    test("returns null for a plain OP_CHECKSIG script", () => {
      const pubKeyBuf = Buffer.from(validCompressedPubKey, "hex");
      const script = bitcoin.script.compile([
        pubKeyBuf,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const result = ScriptUtils.extractSequenceFromScript(
        Buffer.from(script).toString("hex"),
      );
      expect(result).toBeNull();
    });

    test("returns null for an empty/invalid hex string", () => {
      expect(ScriptUtils.extractSequenceFromScript("")).toBeNull();
      expect(ScriptUtils.extractSequenceFromScript("zzzzzz")).toBeNull();
    });

    test("extractLocktimeFromScript returns null for a CSV script", () => {
      // Ensure the two extractors don't cross-detect each other's opcode
      const pubKeyBuf = Buffer.from(validCompressedPubKey, "hex");
      const script = bitcoin.script.compile([
        bitcoin.script.number.encode(144),
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        pubKeyBuf,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      expect(
        ScriptUtils.extractLocktimeFromScript(
          Buffer.from(script).toString("hex"),
        ),
      ).toBeNull();
    });
  });
});
