import { describe, test, expect, beforeAll } from "vitest";
import { TransactionManager } from "../src/locker/transactions";
import { NETWORKS } from "../src/utils/network";
import * as bitcoin from "bitcoinjs-lib";
import tinysecp from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";

describe("TransactionManager", () => {
  let txManager: TransactionManager;
  let ECPair: ReturnType<typeof ECPairFactory>;
  let testKeyPair: ReturnType<ReturnType<typeof ECPairFactory>["makeRandom"]>;
  let publicKeyHex: string;

  beforeAll(async () => {
    const ecc = (tinysecp as any).default || tinysecp;
    bitcoin.initEccLib(ecc);
    ECPair = ECPairFactory(ecc);
    testKeyPair = ECPair.makeRandom({
      compressed: true,
      network: bitcoin.networks.testnet,
    });
    publicKeyHex = testKeyPair.publicKey.toString("hex");

    txManager = new TransactionManager(NETWORKS.testnet);
    await txManager.init();
  });

  describe("createSpendingTransaction", () => {
    test("should create unsigned spending transaction with expired timelock", async () => {
      // Create a timelock script for the past
      const pastLocktime = Math.floor(Date.now() / 1000) - 3600;
      const redeemScript = bitcoin.script.compile([
        bitcoin.script.number.encode(pastLocktime),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        testKeyPair.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);

      const { address } = bitcoin.payments.p2wpkh({
        pubkey: testKeyPair.publicKey,
        network: bitcoin.networks.testnet,
      });

      const result = await txManager.createSpendingTransaction({
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 100000 }],
        outputs: [{ address: address!, value: 95000 }],
        redeemScript: Buffer.from(redeemScript).toString("hex"),
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    test("should throw for unexpired timelock", async () => {
      const futureLocktime = Math.floor(Date.now() / 1000) + 360000;
      const redeemScript = bitcoin.script.compile([
        bitcoin.script.number.encode(futureLocktime),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        testKeyPair.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);

      const { address } = bitcoin.payments.p2wpkh({
        pubkey: testKeyPair.publicKey,
        network: bitcoin.networks.testnet,
      });

      await expect(
        txManager.createSpendingTransaction({
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 100000 }],
          outputs: [{ address: address!, value: 95000 }],
          redeemScript: Buffer.from(redeemScript).toString("hex"),
        }),
      ).rejects.toThrow("Timelock has not expired");
    });

    test("should handle non-timelock scripts", async () => {
      const redeemScript = bitcoin.script.compile([
        testKeyPair.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);

      const { address } = bitcoin.payments.p2wpkh({
        pubkey: testKeyPair.publicKey,
        network: bitcoin.networks.testnet,
      });

      const result = await txManager.createSpendingTransaction({
        inputs: [{ txid: "b".repeat(64), vout: 0, value: 100000 }],
        outputs: [{ address: address!, value: 95000 }],
        redeemScript: Buffer.from(redeemScript).toString("hex"),
      });

      expect(typeof result).toBe("string");
    });
  });

  describe("createFundingTransaction", () => {
    test("should create unsigned funding transaction", async () => {
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: testKeyPair.publicKey,
        network: bitcoin.networks.testnet,
      });

      const result = await txManager.createFundingTransaction({
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 200000 }],
        outputs: [{ address: address!, value: 100000 }],
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
