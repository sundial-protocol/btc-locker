import { describe, test, expect, beforeAll } from "vitest";
import { KeyPairGenerator } from "../src/locker/keypair";
import { NETWORKS } from "../src/utils/network";

describe("KeyPairGenerator", () => {
  let generator: KeyPairGenerator;

  beforeAll(async () => {
    generator = new KeyPairGenerator(NETWORKS.testnet);
    await generator.init();
  });

  describe("generateKeyPair", () => {
    test("should generate a key pair with all required fields", async () => {
      const kp = await generator.generateKeyPair();
      expect(kp).toHaveProperty("privateKey");
      expect(kp).toHaveProperty("publicKey");
      expect(kp).toHaveProperty("address");
      expect(kp.privateKey).toHaveLength(64);
      expect(kp.publicKey).toHaveLength(66);
      expect(kp.address).toMatch(/^(tb1|2|m|n)/);
    });

    test("should generate unique key pairs", async () => {
      const kp1 = await generator.generateKeyPair();
      const kp2 = await generator.generateKeyPair();
      expect(kp1.privateKey).not.toBe(kp2.privateKey);
      expect(kp1.publicKey).not.toBe(kp2.publicKey);
    });
  });

  describe("generateKeyPairFromPrivateKey", () => {
    test("should generate key pair from valid private key", async () => {
      const privKeyHex =
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const kp = await generator.generateKeyPairFromPrivateKey(privKeyHex);
      expect(kp.privateKey).toBe(privKeyHex);
      expect(kp.publicKey).toBeDefined();
      expect(kp.address).toBeDefined();
    });

    test("should throw for invalid private key hex", async () => {
      await expect(
        generator.generateKeyPairFromPrivateKey("invalid"),
      ).rejects.toThrow();
    });

    test("should produce deterministic results", async () => {
      const privKeyHex =
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      const kp1 = await generator.generateKeyPairFromPrivateKey(privKeyHex);
      const kp2 = await generator.generateKeyPairFromPrivateKey(privKeyHex);
      expect(kp1.publicKey).toBe(kp2.publicKey);
      expect(kp1.address).toBe(kp2.address);
    });
  });
});
