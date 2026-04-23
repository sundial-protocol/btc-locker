import { describe, test, expect, beforeAll } from "vitest";
import { TransactionManager } from "../src/locker/transaction-manager";
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

  describe("createSpendingTransaction (CSV)", () => {
    test("sets transaction version to 2 for a CSV script", async () => {
      const sequence = 144;
      const redeemScript = bitcoin.script.compile([
        bitcoin.script.number.encode(sequence),
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        testKeyPair.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: testKeyPair.publicKey,
        network: bitcoin.networks.testnet,
      });

      const psbtB64 = await txManager.createSpendingTransaction({
        inputs: [{ txid: "c".repeat(64), vout: 0, value: 100000 }],
        outputs: [{ address: address!, value: 95000 }],
        redeemScript: Buffer.from(redeemScript).toString("hex"),
      });

      const psbt = bitcoin.Psbt.fromBase64(psbtB64, {
        network: bitcoin.networks.testnet,
      });
      // BIP-68 requires version ≥ 2 — must not be 1
      expect(psbt.version).toBeGreaterThanOrEqual(2);
    });

    test("encodes nSequence as BIP-68 block-based relative locktime for CSV inputs", async () => {
      const sequence = 144;
      const redeemScript = bitcoin.script.compile([
        bitcoin.script.number.encode(sequence),
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        testKeyPair.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: testKeyPair.publicKey,
        network: bitcoin.networks.testnet,
      });

      const psbtB64 = await txManager.createSpendingTransaction({
        inputs: [{ txid: "c".repeat(64), vout: 0, value: 100000 }],
        outputs: [{ address: address!, value: 95000 }],
        redeemScript: Buffer.from(redeemScript).toString("hex"),
      });

      const psbt = bitcoin.Psbt.fromBase64(psbtB64, {
        network: bitcoin.networks.testnet,
      });
      const inputSequence = psbt.txInputs[0].sequence;

      // BIP-68 block-based: bit 31 = 0 (enabled), bit 22 = 0 (blocks), low 16 bits = count
      // Must NOT be 0xffffffff (disabled) or 0xfffffffe (CLTV signal)
      expect(inputSequence).not.toBe(0xffffffff);
      expect(inputSequence).not.toBe(0xfffffffe);
      // Low 16 bits must equal the sequence value from the script
      expect(inputSequence! & 0xffff).toBe(sequence);
      // Disable flag (bit 31) must be clear
      expect(inputSequence! & 0x80000000).toBe(0);
    });

    test("CLTV script uses 0xfffffffe sequence (not BIP-68 relative locktime)", async () => {
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

      const psbtB64 = await txManager.createSpendingTransaction({
        inputs: [{ txid: "d".repeat(64), vout: 0, value: 100000 }],
        outputs: [{ address: address!, value: 95000 }],
        redeemScript: Buffer.from(redeemScript).toString("hex"),
      });

      const psbt = bitcoin.Psbt.fromBase64(psbtB64, {
        network: bitcoin.networks.testnet,
      });
      // CLTV: sequence must signal nLockTime (0xfffffffe), not 0xffffffff (final) or a BIP-68 relative value
      expect(psbt.txInputs[0].sequence).toBe(0xfffffffe);
      // CLTV does not need BIP-68 encoding — disable flag (bit 31) must be set
      expect(psbt.txInputs[0].sequence! & 0x80000000).not.toBe(0);
    });

    test("plain script uses 0xffffffff sequence", async () => {
      const redeemScript = bitcoin.script.compile([
        testKeyPair.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: testKeyPair.publicKey,
        network: bitcoin.networks.testnet,
      });

      const psbtB64 = await txManager.createSpendingTransaction({
        inputs: [{ txid: "e".repeat(64), vout: 0, value: 100000 }],
        outputs: [{ address: address!, value: 95000 }],
        redeemScript: Buffer.from(redeemScript).toString("hex"),
      });

      const psbt = bitcoin.Psbt.fromBase64(psbtB64, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.txInputs[0].sequence).toBe(0xffffffff);
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
        sourceAddress: address!,
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
