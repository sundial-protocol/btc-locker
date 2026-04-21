import { describe, test, expect, beforeAll } from "vitest";
import { BTCLocker } from "../src/locker/index";
import { NETWORKS } from "../src/utils/network";
import * as bitcoin from "bitcoinjs-lib";

describe("BTCLocker (index)", () => {
  let locker: BTCLocker;

  beforeAll(async () => {
    locker = new BTCLocker("testnet");
    await locker.init();
  });

  describe("constructor", () => {
    test("should accept string network name 'testnet'", () => {
      const l = new BTCLocker("testnet");
      expect(l.network).toBe(bitcoin.networks.testnet);
    });

    test("should accept string network name 'bitcoin'", () => {
      const l = new BTCLocker("bitcoin");
      expect(l.network).toBe(bitcoin.networks.bitcoin);
    });

    test("should accept NetworkType object", () => {
      const l = new BTCLocker(NETWORKS.testnet);
      expect(l.network).toBe(bitcoin.networks.testnet);
    });

    test("should default to testnet when no network given", () => {
      const l = new BTCLocker();
      expect(l.network).toBe(bitcoin.networks.testnet);
    });

    test("should throw for unknown string network", () => {
      expect(() => new BTCLocker("invalid" as any)).toThrow(
        "Unknown network: invalid",
      );
    });

    test("should have all component managers", () => {
      expect(locker.keyPairGenerator).toBeDefined();
      expect(locker.transactionManager).toBeDefined();
      expect(locker.scriptManager).toBeDefined();
    });
  });

  describe("isTimelockExpired", () => {
    test("should return true for past locktime", () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600;
      expect(locker.isTimelockExpired(pastTime)).toBe(true);
    });

    test("should return false for future locktime", () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      expect(locker.isTimelockExpired(futureTime)).toBe(false);
    });

    test("should accept custom current time", () => {
      expect(locker.isTimelockExpired(1000, 2000)).toBe(true);
      expect(locker.isTimelockExpired(3000, 2000)).toBe(false);
    });
  });

  describe("delegated methods", () => {
    test("should delegate generateKeyPair", async () => {
      const kp = await locker.generateKeyPair();
      expect(kp).toHaveProperty("privateKey");
      expect(kp).toHaveProperty("publicKey");
      expect(kp).toHaveProperty("address");
    });

    test("should delegate createTimelockScript", async () => {
      const kp = await locker.generateKeyPair();
      const locktime = Math.floor(Date.now() / 1000) + 3600;
      const script = await locker.createTimelockScript(locktime, kp.publicKey);
      expect(script.type).toBe("timelock");
      expect(script.locktime).toBe(locktime);
    });

    test("should delegate createRelativeTimelockScript", async () => {
      const kp = await locker.generateKeyPair();
      const script = await locker.createRelativeTimelockScript(
        144,
        kp.publicKey,
      );
      expect(script.type).toBe("relative-timelock");
      expect(script.sequence).toBe(144);
    });

    test("should delegate createEscrowScript", async () => {
      const kp1 = await locker.generateKeyPair();
      const kp2 = await locker.generateKeyPair();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const script = await locker.createEscrowScript(
        deadline,
        kp1.publicKey,
        kp2.publicKey,
      );
      expect(script.type).toBe("time-escrow");
      expect(script.locktime).toBe(deadline);
    });
  });
});
