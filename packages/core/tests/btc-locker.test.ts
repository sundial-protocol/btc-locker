import { describe, test, expect, beforeEach } from "vitest";
import {
  BTCLocker,
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
} from "../src/index";
import * as bitcoin from "bitcoinjs-lib";
import type { ScriptInfo, KeyPair } from "../src/types";

describe("BTCLocker", () => {
  let locker: BTCLocker;

  beforeEach(async () => {
    locker = new BTCLocker("testnet");
    await locker.init();
  });

  describe("Network Configuration", () => {
    test("should accept string network names", async () => {
      // Test testnet string
      const testnetLocker = new BTCLocker("testnet");
      await testnetLocker.init();
      expect(testnetLocker.network).toBe(bitcoin.networks.testnet);

      // Test mainnet string
      const mainnetLocker = new BTCLocker("bitcoin");
      await mainnetLocker.init();
      expect(mainnetLocker.network).toBe(bitcoin.networks.bitcoin);
    });

    test("should accept network objects", async () => {
      const networkLocker = new BTCLocker("testnet");
      await networkLocker.init();
      expect(networkLocker.network).toBe(bitcoin.networks.testnet);
    });

    test("should throw error for invalid network string", () => {
      expect(() => {
        new BTCLocker("invalid" as any);
      }).toThrow("Unknown network: invalid");
    });
  });

  describe("Key Generation", () => {
    test("should generate key pair", async () => {
      const keyPair: KeyPair = await locker.generateKeyPair();

      expect(keyPair).toHaveProperty("privateKey");
      expect(keyPair).toHaveProperty("publicKey");
      expect(keyPair).toHaveProperty("address");
      expect(keyPair.privateKey).toHaveLength(64);
      expect(keyPair.publicKey).toHaveLength(66);
      expect(keyPair.address).toMatch(/^(tb1|2|m|n)/);
    });

    test("should throw error for invalid private key", async () => {
      const invalidPrivateKey = "invalid_private_key";

      await expect(
        locker.keyPairGenerator.generateKeyPairFromPrivateKey(
          invalidPrivateKey,
        ),
      ).rejects.toThrow();
    });
  });

  describe("Timelock Scripts", () => {
    test("should create absolute timelock script", async () => {
      const locktime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const keyPair: KeyPair = await locker.generateKeyPair();

      const scriptInfo: ScriptInfo = await locker.createTimelockScript(
        locktime,
        keyPair.publicKey,
      );

      expect(scriptInfo).toHaveProperty("redeemScript");
      expect(scriptInfo).toHaveProperty("scriptHash");
      expect(scriptInfo).toHaveProperty("address");
      expect(scriptInfo).toHaveProperty("type");
      expect(scriptInfo.locktime).toBe(locktime);
      expect(scriptInfo.type).toBe("timelock");
      expect(scriptInfo.address).toMatch(/^(tb1|2)/);
    });

    test("should create relative timelock script", async () => {
      const sequence = 144; // 1 day in blocks
      const keyPair: KeyPair = await locker.generateKeyPair();

      const scriptInfo: ScriptInfo = await locker.createRelativeTimelockScript(
        sequence,
        keyPair.publicKey,
      );

      expect(scriptInfo).toHaveProperty("redeemScript");
      expect(scriptInfo).toHaveProperty("scriptHash");
      expect(scriptInfo).toHaveProperty("address");
      expect(scriptInfo).toHaveProperty("type");
      expect(scriptInfo.sequence).toBe(sequence);
      expect(scriptInfo.type).toBe("relative-timelock");
    });

    test("should throw error for invalid locktime", async () => {
      const keyPair: KeyPair = await locker.generateKeyPair();

      await expect(
        locker.createTimelockScript(-1, keyPair.publicKey),
      ).rejects.toThrow("locktime must be a non-negative integer");
    });

    test("should throw error for invalid public key", async () => {
      const locktime = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        locker.createTimelockScript(locktime, "invalid_public_key"),
      ).rejects.toThrow();
    });
  });

  describe("Escrow Scripts", () => {
    test("should create escrow script", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const beforeKeyPair: KeyPair = await locker.generateKeyPair();
      const afterKeyPair: KeyPair = await locker.generateKeyPair();

      const scriptInfo: ScriptInfo = await locker.createEscrowScript(
        deadline,
        beforeKeyPair.publicKey,
        afterKeyPair.publicKey,
      );

      expect(scriptInfo).toHaveProperty("redeemScript");
      expect(scriptInfo).toHaveProperty("scriptHash");
      expect(scriptInfo).toHaveProperty("address");
      expect(scriptInfo.locktime).toBe(deadline);
      expect(scriptInfo.beforePublicKey).toBe(beforeKeyPair.publicKey);
      expect(scriptInfo.afterPublicKey).toBe(afterKeyPair.publicKey);
      expect(scriptInfo.type).toBe("time-escrow");
    });
  });
});

describe("Utility Classes", () => {
  describe("TimeUtils", () => {
    test("should convert date to timestamp", () => {
      const date = new Date("2024-01-01T00:00:00Z");
      const timestamp = TimeUtils.dateToTimestamp(date);
      expect(timestamp).toBe(1704067200);
    });

    test("should convert timestamp to date", () => {
      const timestamp = 1704067200;
      const date = TimeUtils.timestampToDate(timestamp);
      expect(date.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    });

    test("should add duration to timestamp", () => {
      const baseTime = 1704067200;
      const duration = 3600; // 1 hour
      const result = TimeUtils.addDuration(duration, baseTime);
      expect(result).toBe(1704070800);
    });

    test("should convert blocks to seconds", () => {
      const blocks = 144;
      const seconds = TimeUtils.blocksToSeconds(blocks);
      expect(seconds).toBe(86400); // 144 * 600 = 86400 seconds (1 day)
    });
  });

  describe("ScriptUtils", () => {
    test("should validate valid public key", () => {
      const validPubKey =
        "02a7451395735369f2643d08dd7ac9b0e62a9b9b3bfefbad4d9b9ff3a0e5b49abc1";
      expect(ScriptUtils.isValidPublicKey(validPubKey)).toBe(true);
    });

    test("should reject invalid public key", () => {
      const invalidPubKey = "invalid_key";
      expect(ScriptUtils.isValidPublicKey(invalidPubKey)).toBe(false);
    });

    test("should validate valid private key", () => {
      const validPrivKey =
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      expect(ScriptUtils.isValidPrivateKey(validPrivKey)).toBe(true);
    });

    test("should reject invalid private key", () => {
      const invalidPrivKey = "invalid_key";
      expect(ScriptUtils.isValidPrivateKey(invalidPrivKey)).toBe(false);
    });
  });

  describe("TransactionUtils", () => {
    test("should convert satoshis to BTC", () => {
      const satoshis = 100000000;
      const btc = TransactionUtils.satoshisToBTC(satoshis);
      expect(btc).toBe(1);
    });

    test("should convert BTC to satoshis", () => {
      const btc = 1.5;
      const satoshis = TransactionUtils.btcToSatoshis(btc);
      expect(satoshis).toBe(150000000);
    });
  });
});
