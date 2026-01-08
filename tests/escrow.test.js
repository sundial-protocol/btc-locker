/**
 * @fileoverview Jest tests for EscrowManager
 */

import { EscrowManager } from "../src/locker/escrow.js";
import { ECPairFactory } from "ecpair";
import tinysecp from "@bitcoinerlab/secp256k1";
import * as bitcoin from "bitcoinjs-lib";

describe("EscrowManager", () => {
  let escrow;
  let ECPair;
  let keyPair1, keyPair2;
  let pubKey1, pubKey2;

  beforeAll(async () => {
    // Initialize ECC
    const ecc = tinysecp.default || tinysecp;
    bitcoin.initEccLib(ecc);
    ECPair = ECPairFactory(ecc);

    // Initialize EscrowManager
    escrow = new EscrowManager("testnet");
    await escrow.init();

    // Generate test key pairs
    keyPair1 = ECPair.makeRandom({ compressed: true });
    keyPair2 = ECPair.makeRandom({ compressed: true });
    
    pubKey1 = keyPair1.publicKey;
    pubKey2 = keyPair2.publicKey;
  });

  describe("Basic functionality", () => {
    test("should initialize EscrowManager", () => {
      expect(escrow).toBeDefined();
      expect(escrow.network).toBeDefined();
    });

    test("should generate test key pairs", () => {
      expect(pubKey1).toBeDefined();
      expect(pubKey2).toBeDefined();
      expect(pubKey1.length).toBe(33); // compressed public key
      expect(pubKey2.length).toBe(33); // compressed public key
    });
  });

  describe("createEscrowScript", () => {
    test("should create escrow script successfully", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      const scriptData = await escrow.createEscrowScript(
        deadline,
        pubKey1, // beforePublicKey
        pubKey2  // afterPublicKey
      );

      expect(scriptData).toBeDefined();
      expect(scriptData.address).toBeDefined();
      expect(scriptData.type).toBe("time-escrow");
      expect(scriptData.deadline).toBe(deadline);
      expect(scriptData.beforePublicKey).toBe(pubKey1.toString("hex"));
      expect(scriptData.afterPublicKey).toBe(pubKey2.toString("hex"));
    });

    test("should reject negative deadline", async () => {
      await expect(
        escrow.createEscrowScript(-1, pubKey1, pubKey2)
      ).rejects.toThrow("deadline must be a non-negative integer");
    });

    test("should reject identical public keys", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await expect(
        escrow.createEscrowScript(deadline, pubKey1, pubKey1)
      ).rejects.toThrow("beforePublicKey and afterPublicKey must be different");
    });

    test("should reject invalid public key", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await expect(
        escrow.createEscrowScript(deadline, "invalid", pubKey2)
      ).rejects.toThrow();
    });
  });

  describe("createEscrowSpendingTransaction", () => {
    let scriptData;
    let testAddress;
    let mockTxId;
    let mockTxBuffer;

    beforeEach(async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      // Create a proper testnet address for the output
      const outputKeyPair = ECPair.makeRandom();
      testAddress = bitcoin.payments.p2wpkh({
        pubkey: outputKeyPair.publicKey,
        network: bitcoin.networks.testnet,
      }).address;
      
      scriptData = await escrow.createEscrowScript(
        deadline,
        keyPair1.publicKey,
        keyPair2.publicKey
      );
      
      // Create a mock transaction that we can reference
      const mockTx = new bitcoin.Transaction();
      mockTx.version = 2;
      mockTx.addInput(Buffer.alloc(32), 0xffffffff);
      // Add an output using our escrow script
      const p2sh = bitcoin.payments.p2sh({
        redeem: { output: Buffer.from(scriptData.redeemScript, "hex") },
        network: bitcoin.networks.testnet,
      });
      mockTx.addOutput(p2sh.output, BigInt(100000));
      mockTxId = mockTx.getId();
      mockTxBuffer = mockTx.toBuffer();
    });

    test("should create before-deadline spending transaction", async () => {
      const beforeTx = await escrow.createEscrowSpendingTransaction(
        scriptData,
        mockTxId,
        0,
        100000,
        testAddress,
        false, // before deadline
        keyPair1.privateKey,
        Date.now(), // current time (before deadline)
        mockTxBuffer // previous transaction
      );

      expect(beforeTx).toBeDefined();
      expect(beforeTx.txHex).toBeDefined();
      expect(beforeTx.txId).toBeDefined();
    });

    test("should reject early after-deadline spending", async () => {
      await expect(
        escrow.createEscrowSpendingTransaction(
          scriptData,
          mockTxId,
          0,
          100000,
          testAddress,
          true, // after deadline
          keyPair2.privateKey,
          Date.now(), // current time (before deadline)
          mockTxBuffer // previous transaction
        )
      ).rejects.toThrow("Cannot spend after deadline yet");
    });

    test("should create after-deadline spending transaction with future time", async () => {
      const futureTime = (scriptData.deadline + 1000) * 1000; // Convert to milliseconds and add buffer
      
      const afterTx = await escrow.createEscrowSpendingTransaction(
        scriptData,
        mockTxId,
        0,
        100000,
        testAddress,
        true, // after deadline
        keyPair2.privateKey,
        futureTime,
        mockTxBuffer // previous transaction
      );

      expect(afterTx).toBeDefined();
      expect(afterTx.txHex).toBeDefined();
      expect(afterTx.txId).toBeDefined();
    });

    test("should reject wrong private key for before-deadline spending", async () => {
      await expect(
        escrow.createEscrowSpendingTransaction(
          scriptData,
          mockTxId,
          0,
          100000,
          testAddress,
          false, // before deadline
          keyPair2.privateKey, // wrong key (should be keyPair1)
          Date.now(),
          mockTxBuffer // previous transaction
        )
      ).rejects.toThrow("Private key does not correspond to beforePublicKey");
    });

    test("should reject wrong private key for after-deadline spending", async () => {
      const futureTime = (scriptData.deadline + 1000) * 1000;
      
      await expect(
        escrow.createEscrowSpendingTransaction(
          scriptData,
          mockTxId,
          0,
          100000,
          testAddress,
          true, // after deadline
          keyPair1.privateKey, // wrong key (should be keyPair2)
          futureTime,
          mockTxBuffer // previous transaction
        )
      ).rejects.toThrow("Private key does not correspond to afterPublicKey");
    });

    test("should reject invalid script data", async () => {
      const invalidScript = { ...scriptData, type: "invalid" };
      
      await expect(
        escrow.createEscrowSpendingTransaction(
          invalidScript,
          mockTxId,
          0,
          100000,
          testAddress,
          false,
          keyPair1.privateKey,
          Date.now(),
          mockTxBuffer // previous transaction
        )
      ).rejects.toThrow("Invalid script data - must be a time-escrow script");
    });
  });
});