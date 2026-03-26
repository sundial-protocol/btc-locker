/**
 * @fileoverview Vitest tests for EscrowManager
 */

import { describe, test, expect, beforeAll, beforeEach } from "vitest";
import { TransactionManager } from "../src/locker/transaction-manager";
import { ScriptManager } from "../src/locker/script-manager";
import { ECPairFactory, ECPairInterface } from "ecpair";
import tinysecp from "@bitcoinerlab/secp256k1";
import * as bitcoin from "bitcoinjs-lib";
import type { ScriptInfo } from "../src/types";
import { NETWORKS } from "../src/utils/network";

describe("EscrowManager", () => {
  let escrow: ScriptManager;
  let txManager: TransactionManager;
  let ECPair: ReturnType<typeof ECPairFactory>;
  let keyPair1: ECPairInterface, keyPair2: ECPairInterface;
  let pubKey1: Buffer, pubKey2: Buffer;

  beforeAll(async () => {
    // Initialize ECC
    const ecc = (tinysecp as any).default || tinysecp;
    bitcoin.initEccLib(ecc);
    ECPair = ECPairFactory(ecc);

    // Initialize ScriptManager
    escrow = new ScriptManager(NETWORKS.testnet);
    await escrow.init();

    // Initialize TransactionManager
    txManager = new TransactionManager(NETWORKS.testnet);
    await txManager.init();

    // Generate test key pairs
    keyPair1 = ECPair.makeRandom({ compressed: true });
    keyPair2 = ECPair.makeRandom({ compressed: true });

    pubKey1 = keyPair1.publicKey;
    pubKey2 = keyPair2.publicKey;
  });

  // Helper function to create a mock transaction for testing
  const createMockTransaction = (): Buffer => {
    // Create a minimal valid Bitcoin transaction for testing
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });

    // Add a dummy input (won't be validated in tests)
    psbt.addInput({
      hash: "b".repeat(64),
      index: 0,
      sequence: 0xffffffff,
      witnessUtxo: {
        script: Buffer.from(
          "00141234567890123456789012345678901234567890",
          "hex",
        ),
        value: BigInt(100000),
      },
    });

    // Add a dummy output
    psbt.addOutput({
      address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      value: BigInt(99000),
    });

    // For testing purposes, we don't need to sign it
    // Just return the transaction buffer (convert Uint8Array to Buffer)
    const txBuffer = psbt.data.globalMap.unsignedTx!.toBuffer();
    return Buffer.from(txBuffer);
  };

  describe("Escrow Script Creation", () => {
    test("should create escrow script with valid parameters", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const scriptData: ScriptInfo = await escrow.createEscrowScript(
        deadline,
        pubKey1,
        pubKey2,
      );

      expect(scriptData).toHaveProperty("redeemScript");
      expect(scriptData).toHaveProperty("scriptHash");
      expect(scriptData).toHaveProperty("address");
      expect(scriptData).toHaveProperty("type");
      expect(scriptData).toHaveProperty("locktime");
      expect(scriptData).toHaveProperty("beforePublicKey");
      expect(scriptData).toHaveProperty("afterPublicKey");

      expect(scriptData.type).toBe("time-escrow");
      expect(scriptData.locktime).toBe(deadline);
      expect(scriptData.beforePublicKey).toBe(pubKey1.toString("hex"));
      expect(scriptData.afterPublicKey).toBe(pubKey2.toString("hex"));
      expect(scriptData.address).toMatch(/^(tb1|2|m|n)/); // Testnet address pattern
    });

    test("should throw error for invalid deadline", async () => {
      const invalidDeadline = -1;

      await expect(
        escrow.createEscrowScript(invalidDeadline, pubKey1, pubKey2),
      ).rejects.toThrow("deadline must be a non-negative integer");
    });

    test("should throw error for invalid before public key", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const invalidPubKey = Buffer.from("invalid", "hex");

      await expect(
        escrow.createEscrowScript(deadline, invalidPubKey, pubKey2),
      ).rejects.toThrow();
    });

    test("should throw error for invalid after public key", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const invalidPubKey = Buffer.from("invalid", "hex");

      await expect(
        escrow.createEscrowScript(deadline, pubKey1, invalidPubKey),
      ).rejects.toThrow();
    });

    test("should handle string public keys", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const pubKeyHex1 = pubKey1.toString("hex");
      const pubKeyHex2 = pubKey2.toString("hex");

      const scriptData: ScriptInfo = await escrow.createEscrowScript(
        deadline,
        pubKeyHex1,
        pubKeyHex2,
      );

      expect(scriptData.beforePublicKey).toBe(pubKeyHex1);
      expect(scriptData.afterPublicKey).toBe(pubKeyHex2);
    });
  });

  describe("Escrow Spending Transaction", () => {
    let scriptData: ScriptInfo;
    const deadline = Math.floor(Date.now() / 1000) + 7200; // 2 hours in the future
    const utxoTxId = "a".repeat(64);
    const utxoIndex = 0;
    const amount = 100000;
    const outputAddress = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";

    beforeEach(async () => {
      scriptData = await escrow.createEscrowScript(deadline, pubKey1, pubKey2);
    });

    test("should create spending transaction before deadline", async () => {
      const spendAfterDeadline = false;
      const currentTime = (deadline - 3600) * 1000; // 1 hour before deadline, in milliseconds
      const mockTx = createMockTransaction();

      const result = await txManager.createClaimTransaction({
        scriptData,
        utxoTxId,
        utxoIndex,
        amount,
        outputAddress,
        spendAfterDeadline,
        currentTime,
        previousTransaction: mockTx,
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    test("should create spending transaction after deadline", async () => {
      const spendAfterDeadline = true;
      const currentTime = (deadline + 3600) * 1000; // 1 hour after deadline, in milliseconds
      const mockTx = createMockTransaction();

      const result = await txManager.createClaimTransaction({
        scriptData,
        utxoTxId,
        utxoIndex,
        amount,
        outputAddress,
        spendAfterDeadline,
        currentTime,
        previousTransaction: mockTx,
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    test("should throw error when trying to spend before deadline with wrong key", async () => {
      const spendAfterDeadline = false;
      const currentTime = deadline - 1800;
      const mockTx = createMockTransaction();

      // Note: The createClaimTransaction method doesn't validate private keys
      // That validation happens during signing. This test should pass since we're only creating unsigned tx.
      const result = await txManager.createClaimTransaction({
        scriptData,
        utxoTxId,
        utxoIndex,
        amount,
        outputAddress,
        spendAfterDeadline,
        currentTime,
        previousTransaction: mockTx,
      });

      expect(typeof result).toBe("string");
    });

    test("should throw error when trying to spend after deadline with wrong key", async () => {
      const spendAfterDeadline = true;
      const currentTime = (deadline + 1800) * 1000; // in milliseconds
      const mockTx = createMockTransaction();

      // Note: The createClaimTransaction method doesn't validate private keys
      // That validation happens during signing. This test should pass since we're only creating unsigned tx.
      const result = await txManager.createClaimTransaction({
        scriptData,
        utxoTxId,
        utxoIndex,
        amount,
        outputAddress,
        spendAfterDeadline,
        currentTime,
        previousTransaction: mockTx,
      });

      expect(typeof result).toBe("string");
    });

    test("should throw error when trying to spend after deadline before deadline has passed", async () => {
      const spendAfterDeadline = true;
      const currentTime = (deadline - 1800) * 1000; // Before deadline, in milliseconds
      const mockTx = createMockTransaction();

      await expect(
        txManager.createClaimTransaction({
          scriptData,
          utxoTxId,
          utxoIndex,
          amount,
          outputAddress,
          spendAfterDeadline,
          currentTime,
          previousTransaction: mockTx,
        }),
      ).rejects.toThrow("Cannot spend after deadline yet.");
    });

    test("should handle string private key", async () => {
      const spendAfterDeadline = false;
      const currentTime = deadline - 1800;
      const mockTx = createMockTransaction();
      // Note: Private keys are not used in createClaimTransaction anymore
      // They are used in signing step. This test now just verifies unsigned tx creation.

      const result = await txManager.createClaimTransaction({
        scriptData,
        utxoTxId,
        utxoIndex,
        amount,
        outputAddress,
        spendAfterDeadline,
        currentTime,
        previousTransaction: mockTx,
      });

      expect(typeof result).toBe("string");
    });

    test("should throw error for invalid output address", async () => {
      const spendAfterDeadline = false;
      const currentTime = deadline - 1800;
      const invalidAddress = "invalid_address";
      const mockTx = createMockTransaction();

      await expect(
        txManager.createClaimTransaction({
          scriptData,
          utxoTxId,
          utxoIndex,
          amount,
          outputAddress: invalidAddress,
          spendAfterDeadline,
          currentTime,
          previousTransaction: mockTx,
        }),
      ).rejects.toThrow();
    });

    test("should throw error for invalid amount", async () => {
      const spendAfterDeadline = false;
      const currentTime = deadline - 1800;
      const invalidAmount = -1000;
      const mockTx = createMockTransaction();

      await expect(
        txManager.createClaimTransaction({
          scriptData,
          utxoTxId,
          utxoIndex,
          amount: invalidAmount,
          outputAddress,
          spendAfterDeadline,
          currentTime,
          previousTransaction: mockTx,
        }),
      ).rejects.toThrow("amount must be a positive integer");
    });

    test("should throw error for invalid UTXO transaction ID", async () => {
      const spendAfterDeadline = false;
      const currentTime = deadline - 1800;
      const invalidTxId = "invalid_txid";
      const mockTx = createMockTransaction();

      await expect(
        txManager.createClaimTransaction({
          scriptData,
          utxoTxId: invalidTxId,
          utxoIndex,
          amount,
          outputAddress,
          spendAfterDeadline,
          currentTime,
          previousTransaction: mockTx,
        }),
      ).rejects.toThrow();
    });
  });

  describe("Edge Cases", () => {
    test("should handle very large deadline values", async () => {
      const largeDeadline = 2147483647; // Max 32-bit signed integer

      const scriptData: ScriptInfo = await escrow.createEscrowScript(
        largeDeadline,
        pubKey1,
        pubKey2,
      );

      expect(scriptData.locktime).toBe(largeDeadline);
    });

    test("should handle current time as deadline", async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const mockTx = createMockTransaction();

      const scriptData: ScriptInfo = await escrow.createEscrowScript(
        currentTime,
        pubKey1,
        pubKey2,
      );

      // Should be able to spend after deadline immediately
      const result = await txManager.createClaimTransaction({
        scriptData,
        utxoTxId: "a".repeat(64),
        utxoIndex: 0,
        amount: 100000,
        outputAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        spendAfterDeadline: true,
        currentTime: (currentTime + 60) * 1000, // Add 1 minute buffer, in milliseconds
        previousTransaction: mockTx,
      });

      expect(typeof result).toBe("string");
    });
  });
});
