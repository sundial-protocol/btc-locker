import { describe, test, expect, beforeAll, vi } from "vitest";
import { TransactionManager } from "../src/locker/transaction-manager";
import { NETWORKS } from "../src/utils/network";
import * as bitcoin from "bitcoinjs-lib";
import tinysecp from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import FeeUtils from "../src/utils/fees";

describe("TransactionManager (Dawn Staking)", () => {
  let manager: TransactionManager;
  let testAddress: string;
  let testAddress2: string;
  let testAddress3: string;

  beforeAll(async () => {
    const ecc = (tinysecp as any).default || tinysecp;
    bitcoin.initEccLib(ecc);
    const ECPair = ECPairFactory(ecc);

    const makeAddress = () => {
      const kp = ECPair.makeRandom({
        compressed: true,
        network: bitcoin.networks.testnet,
      });
      return bitcoin.payments.p2wpkh({
        pubkey: kp.publicKey,
        network: bitcoin.networks.testnet,
      }).address!;
    };

    testAddress = makeAddress();
    testAddress2 = makeAddress();
    testAddress3 = makeAddress();

    manager = new TransactionManager(NETWORKS.testnet);
    await manager.init();
  });

  describe("createDepositTransaction", () => {
    test("should throw for empty inputs array", async () => {
      await expect(
        manager.createDepositTransaction({
          inputs: [],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 10000,
          timelockAddress: testAddress2,
          timelockAmount: 20000,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("inputs must be a non-empty array when provided");
    });

    test("should throw when feeAddress given without protocolFeeAmount", async () => {
      await expect(
        manager.createDepositTransaction({
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 10000,
          timelockAddress: testAddress2,
          timelockAmount: 20000,
          feeAddress: testAddress3,
          priority: "medium" as any,
        }),
      ).rejects.toThrow(
        "protocolFeeAmount is required when feeAddress is provided",
      );
    });

    test("should throw when protocolFeeAmount given without feeAddress", async () => {
      await expect(
        manager.createDepositTransaction({
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 10000,
          timelockAddress: testAddress2,
          timelockAmount: 20000,
          protocolFeeAmount: 1000,
          priority: "medium" as any,
        }),
      ).rejects.toThrow(
        "feeAddress is required when protocolFeeAmount is provided",
      );
    });

    test("should throw for non-string escrowAddress", async () => {
      await expect(
        manager.createDepositTransaction({
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
          sourceAddress: testAddress,
          escrowAddress: 12345 as any,
          escrowAmount: 10000,
          timelockAddress: testAddress2,
          timelockAmount: 20000,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("escrowAddress must be a string");
    });

    test("should throw for non-positive escrowAmount", async () => {
      await expect(
        manager.createDepositTransaction({
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 0,
          timelockAddress: testAddress2,
          timelockAmount: 20000,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("escrowAmount must be a positive integer");
    });

    test("should throw for non-string timelockAddress", async () => {
      await expect(
        manager.createDepositTransaction({
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 10000,
          timelockAddress: null as any,
          timelockAmount: 20000,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("timelockAddress must be a string");
    });

    test("should throw for non-positive timelockAmount", async () => {
      await expect(
        manager.createDepositTransaction({
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 10000,
          timelockAddress: testAddress2,
          timelockAmount: -5,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("timelockAmount must be a positive integer");
    });

    test("should throw for invalid input values", async () => {
      await expect(
        manager.createDepositTransaction({
          inputs: [{ txid: "a".repeat(64), vout: 0, value: -100 }],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 10000,
          timelockAddress: testAddress2,
          timelockAmount: 20000,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("All input values must be positive integers");
    });

    test("should throw for insufficient funds", async () => {
      await expect(
        manager.createDepositTransaction({
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 1000 }],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 100000,
          timelockAddress: testAddress2,
          timelockAmount: 200000,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("Insufficient funds");
    });

    test("should throw for below dust threshold escrow amount", async () => {
      await expect(
        manager.createDepositTransaction({
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 5000000 }],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 100,
          timelockAddress: testAddress2,
          timelockAmount: 20000,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("below dust threshold");
    });

    test("should throw for below dust threshold timelock amount", async () => {
      await expect(
        manager.createDepositTransaction({
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 5000000 }],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 10000,
          timelockAddress: testAddress2,
          timelockAmount: 100,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("below dust threshold");
    });

    test("should throw for below dust threshold protocol fee", async () => {
      await expect(
        manager.createDepositTransaction({
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 5000000 }],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 10000,
          timelockAddress: testAddress2,
          timelockAmount: 20000,
          feeAddress: testAddress3,
          protocolFeeAmount: 100,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("below dust threshold");
    });
  });

  describe("createDepositTransactionWithScript", () => {
    test("should throw for invalid timelockScript", async () => {
      await expect(
        manager.createDepositTransactionWithScript({
          timelockScript: null as any,
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 10000,
          timelockAmount: 20000,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("timelockScript must be a valid script object");
    });

    test("should throw for timelockScript without address", async () => {
      await expect(
        manager.createDepositTransactionWithScript({
          timelockScript: {
            redeemScript: "abc",
            scriptHash: "def",
            type: "timelock",
          } as any,
          inputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 10000,
          timelockAmount: 20000,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("timelockScript must have an address property");
    });
  });

  describe("calculateDepositAmounts", () => {
    test("should calculate amounts with provided inputs", async () => {
      const result = await manager.calculateDepositAmounts({
        sourceAddress: testAddress,
        inputs: [{ value: 500000 }],
        desiredEscrowAmount: 100000,
        desiredTimelockAmount: 200000,
      });

      expect(result).toHaveProperty("totalInputValue");
      expect(result).toHaveProperty("estimatedFee");
      expect(result).toHaveProperty("totalRequired");
      expect(result).toHaveProperty("changeAmount");
      expect(result).toHaveProperty("feasible");
      expect(result.totalInputValue).toBe(500000);
      expect(result.feasible).toBe(true);
    });

    test("should detect insufficient funds", async () => {
      const result = await manager.calculateDepositAmounts({
        sourceAddress: testAddress,
        inputs: [{ value: 1000 }],
        desiredEscrowAmount: 100000,
        desiredTimelockAmount: 200000,
      });

      expect(result.feasible).toBe(false);
      expect(result.recommendation).toContain("Insufficient funds");
    });

    test("should detect below dust threshold escrow", async () => {
      const result = await manager.calculateDepositAmounts({
        sourceAddress: testAddress,
        inputs: [{ value: 500000 }],
        desiredEscrowAmount: 100,
        desiredTimelockAmount: 200000,
      });

      expect(result.feasible).toBe(false);
      expect(result.recommendation).toContain("dust threshold");
    });

    test("should detect below dust threshold timelock", async () => {
      const result = await manager.calculateDepositAmounts({
        sourceAddress: testAddress,
        inputs: [{ value: 500000 }],
        desiredEscrowAmount: 100000,
        desiredTimelockAmount: 100,
      });

      expect(result.feasible).toBe(false);
      expect(result.recommendation).toContain("dust threshold");
    });

    test("should throw for non-positive escrow amount", async () => {
      await expect(
        manager.calculateDepositAmounts({
          sourceAddress: testAddress,
          inputs: [{ value: 500000 }],
          desiredEscrowAmount: 0,
          desiredTimelockAmount: 200000,
        }),
      ).rejects.toThrow("desiredEscrowAmount must be a positive integer");
    });

    test("should throw for non-positive timelock amount", async () => {
      await expect(
        manager.calculateDepositAmounts({
          sourceAddress: testAddress,
          inputs: [{ value: 500000 }],
          desiredEscrowAmount: 100000,
          desiredTimelockAmount: -1,
        }),
      ).rejects.toThrow("desiredTimelockAmount must be a positive integer");
    });

    test("should throw for non-array inputs", async () => {
      await expect(
        manager.calculateDepositAmounts({
          sourceAddress: testAddress,
          inputs: "bad" as any,
          desiredEscrowAmount: 100000,
          desiredTimelockAmount: 200000,
        }),
      ).rejects.toThrow("inputs must be an array when provided");
    });

    test("should calculate with include change and protocol fee", async () => {
      const result = await manager.calculateDepositAmounts({
        sourceAddress: testAddress,
        inputs: [{ value: 500000 }],
        desiredEscrowAmount: 100000,
        desiredTimelockAmount: 200000,
        includeChange: true,
        protocolFeeAmount: 5000,
      });

      expect(result.totalInputValue).toBe(500000);
      expect(result.feasible).toBe(true);
    });

    test("should detect below dust protocol fee", async () => {
      const result = await manager.calculateDepositAmounts({
        sourceAddress: testAddress,
        inputs: [{ value: 500000 }],
        desiredEscrowAmount: 100000,
        desiredTimelockAmount: 200000,
        protocolFeeAmount: 100,
      });

      expect(result.feasible).toBe(false);
      expect(result.recommendation).toContain("Protocol fee amount");
    });
  });

  describe("createWithdrawalTransaction", () => {
    test("should throw when no inputs at all", async () => {
      await expect(
        manager.createWithdrawalTransaction({
          escrowInputs: [],
          escrowRedeemScript: "00",
          timelockInputs: [],
          timelockRedeemScript: "00",
          destination: testAddress,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("No confirmed UTXOs available");
    });

    test("should throw when feeAddress given without protocolFeeAmount", async () => {
      await expect(
        manager.createWithdrawalTransaction({
          escrowInputs: [{ txid: "a".repeat(64), vout: 0, value: 100000 }],
          escrowRedeemScript: "00",
          timelockInputs: [],
          timelockRedeemScript: "00",
          destination: testAddress,
          feeAddress: testAddress2,
          priority: "medium" as any,
        }),
      ).rejects.toThrow(
        "protocolFeeAmount is required when feeAddress is provided",
      );
    });

    test("should throw when protocolFeeAmount given without feeAddress", async () => {
      await expect(
        manager.createWithdrawalTransaction({
          escrowInputs: [{ txid: "a".repeat(64), vout: 0, value: 100000 }],
          escrowRedeemScript: "00",
          timelockInputs: [],
          timelockRedeemScript: "00",
          destination: testAddress,
          protocolFeeAmount: 1000,
          priority: "medium" as any,
        }),
      ).rejects.toThrow(
        "feeAddress is required when protocolFeeAmount is provided",
      );
    });
  });
});

describe("TransactionManager (mocked fees)", () => {
  let manager: TransactionManager;
  let testAddress: string;
  let testAddress2: string;
  let testAddress3: string;

  beforeAll(async () => {
    const ecc = (tinysecp as any).default || tinysecp;
    bitcoin.initEccLib(ecc);
    const ECPair = ECPairFactory(ecc);

    const makeAddress = () => {
      const kp = ECPair.makeRandom({
        compressed: true,
        network: bitcoin.networks.testnet,
      });
      return bitcoin.payments.p2wpkh({
        pubkey: kp.publicKey,
        network: bitcoin.networks.testnet,
      }).address!;
    };

    testAddress = makeAddress();
    testAddress2 = makeAddress();
    testAddress3 = makeAddress();

    vi.spyOn(FeeUtils, "queryChainFeeRates").mockResolvedValue(10);

    manager = new TransactionManager(NETWORKS.testnet);
    await manager.init();
  });

  describe("createDepositTransaction (happy path)", () => {
    test("should create PSBT with escrow and timelock outputs", async () => {
      const result = await manager.createDepositTransaction({
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 5000000 }],
        sourceAddress: testAddress,
        escrowAddress: testAddress,
        escrowAmount: 100000,
        timelockAddress: testAddress2,
        timelockAmount: 200000,
        priority: "medium" as any,
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
      // Verify it's valid base64 PSBT
      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.inputCount).toBe(1);
      expect(psbt.txOutputs).toHaveLength(2);
    });

    test("should include protocol fee output", async () => {
      const result = await manager.createDepositTransaction({
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 5000000 }],
        sourceAddress: testAddress,
        escrowAddress: testAddress,
        escrowAmount: 100000,
        timelockAddress: testAddress2,
        timelockAmount: 200000,
        feeAddress: testAddress3,
        protocolFeeAmount: 5000,
        priority: "medium" as any,
      });

      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.txOutputs).toHaveLength(3); // escrow + timelock + protocol fee
    });

    test("should include change output", async () => {
      const result = await manager.createDepositTransaction({
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 5000000 }],
        sourceAddress: testAddress,
        escrowAddress: testAddress,
        escrowAmount: 100000,
        timelockAddress: testAddress2,
        timelockAmount: 200000,
        changeAddress: testAddress3,
        priority: "medium" as any,
      });

      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      // escrow + timelock + change (if change > dust)
      expect(psbt.txOutputs.length).toBeGreaterThanOrEqual(3);
    });

    test("should include metadata output", async () => {
      const result = await manager.createDepositTransaction({
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 5000000 }],
        sourceAddress: testAddress,
        escrowAddress: testAddress,
        escrowAmount: 100000,
        timelockAddress: testAddress2,
        timelockAmount: 200000,
        metadata: JSON.stringify({
          txType: 1,
          subjectId: "550e8400-e29b-41d4-a716-446655440000",
          providerXonlyPubkey: "a".repeat(64),
        }),
        priority: "medium" as any,
      });

      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      // escrow + timelock + metadata OP_RETURN
      expect(psbt.txOutputs).toHaveLength(3);
    });

    test("should handle multiple inputs", async () => {
      const result = await manager.createDepositTransaction({
        inputs: [
          { txid: "a".repeat(64), vout: 0, value: 200000 },
          { txid: "b".repeat(64), vout: 1, value: 300000 },
        ],
        sourceAddress: testAddress,
        escrowAddress: testAddress,
        escrowAmount: 100000,
        timelockAddress: testAddress2,
        timelockAmount: 200000,
        priority: "medium" as any,
      });

      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.inputCount).toBe(2);
    });
  });

  describe("createDepositTransactionWithScript (happy path)", () => {
    test("should create PSBT using timelockScript address", async () => {
      const result = await manager.createDepositTransactionWithScript({
        timelockScript: {
          address: testAddress2,
          redeemScript: "aabb",
          scriptHash: "ccdd",
          type: "timelock",
        } as any,
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 5000000 }],
        sourceAddress: testAddress,
        escrowAddress: testAddress,
        escrowAmount: 100000,
        timelockAmount: 200000,
        priority: "medium" as any,
      });

      expect(typeof result).toBe("string");
      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.txOutputs).toHaveLength(2);
    });
  });

  describe("createWithdrawalTransaction (happy path)", () => {
    test("should create withdrawal with escrow inputs only", async () => {
      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        compressed: true,
        network: bitcoin.networks.testnet,
      });

      // Simple redeem script (no time constraints)
      const redeemScript = bitcoin.script.compile([
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const scriptHash = bitcoin.crypto.hash160(redeemScript);
      const p2shScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_HASH160,
        scriptHash,
        bitcoin.opcodes.OP_EQUAL,
      ]);

      // Create a fake prev tx with output paying to the P2SH address
      const prevTx = new bitcoin.Transaction();
      prevTx.addInput(Buffer.alloc(32), 0);
      prevTx.addOutput(p2shScript, BigInt(100000));
      const prevTxHex = prevTx.toHex();
      const prevTxId = prevTx.getId();

      vi.spyOn(manager.api, "getTransaction").mockResolvedValue(prevTxHex);

      const result = await manager.createWithdrawalTransaction({
        escrowInputs: [{ txid: prevTxId, vout: 0, value: 100000 }],
        escrowRedeemScript: Buffer.from(redeemScript).toString("hex"),
        timelockInputs: [],
        timelockRedeemScript: Buffer.from(redeemScript).toString("hex"),
        destination: testAddress,
        priority: "medium" as any,
      });

      expect(typeof result).toBe("string");
      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.inputCount).toBe(1);
      expect(psbt.txOutputs.length).toBeGreaterThanOrEqual(1);
    });

    test("should create withdrawal with both escrow and timelock inputs", async () => {
      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        compressed: true,
        network: bitcoin.networks.testnet,
      });

      const redeemScript = bitcoin.script.compile([
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const scriptHash = bitcoin.crypto.hash160(redeemScript);
      const p2shScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_HASH160,
        scriptHash,
        bitcoin.opcodes.OP_EQUAL,
      ]);

      // Create fake prev txs
      const prevTx1 = new bitcoin.Transaction();
      prevTx1.addInput(Buffer.alloc(32), 0);
      prevTx1.addOutput(p2shScript, BigInt(100000));

      const prevTx2 = new bitcoin.Transaction();
      prevTx2.addInput(Buffer.alloc(32), 1);
      prevTx2.addOutput(p2shScript, BigInt(200000));

      vi.spyOn(manager.api, "getTransaction").mockImplementation(
        async (txid: string) => {
          if (txid === prevTx1.getId()) return prevTx1.toHex();
          return prevTx2.toHex();
        },
      );

      const result = await manager.createWithdrawalTransaction({
        escrowInputs: [{ txid: prevTx1.getId(), vout: 0, value: 100000 }],
        escrowRedeemScript: Buffer.from(redeemScript).toString("hex"),
        timelockInputs: [{ txid: prevTx2.getId(), vout: 0, value: 200000 }],
        timelockRedeemScript: Buffer.from(redeemScript).toString("hex"),
        destination: testAddress,
        priority: "medium" as any,
      });

      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.inputCount).toBe(2);
    });

    test("should include protocol fee output in withdrawal", async () => {
      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        compressed: true,
        network: bitcoin.networks.testnet,
      });

      const redeemScript = bitcoin.script.compile([
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const scriptHash = bitcoin.crypto.hash160(redeemScript);
      const p2shScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_HASH160,
        scriptHash,
        bitcoin.opcodes.OP_EQUAL,
      ]);

      const prevTx = new bitcoin.Transaction();
      prevTx.addInput(Buffer.alloc(32), 0);
      prevTx.addOutput(p2shScript, BigInt(500000));

      vi.spyOn(manager.api, "getTransaction").mockResolvedValue(prevTx.toHex());

      const result = await manager.createWithdrawalTransaction({
        escrowInputs: [{ txid: prevTx.getId(), vout: 0, value: 500000 }],
        escrowRedeemScript: Buffer.from(redeemScript).toString("hex"),
        timelockInputs: [],
        timelockRedeemScript: Buffer.from(redeemScript).toString("hex"),
        destination: testAddress,
        feeAddress: testAddress2,
        protocolFeeAmount: 5000,
        priority: "medium" as any,
      });

      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.txOutputs).toHaveLength(2); // destination + protocol fee
    });

    test("should include metadata output in withdrawal", async () => {
      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        compressed: true,
        network: bitcoin.networks.testnet,
      });

      const redeemScript = bitcoin.script.compile([
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);
      const scriptHash = bitcoin.crypto.hash160(redeemScript);
      const p2shScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_HASH160,
        scriptHash,
        bitcoin.opcodes.OP_EQUAL,
      ]);

      const prevTx = new bitcoin.Transaction();
      prevTx.addInput(Buffer.alloc(32), 0);
      prevTx.addOutput(p2shScript, BigInt(500000));

      vi.spyOn(manager.api, "getTransaction").mockResolvedValue(prevTx.toHex());

      const result = await manager.createWithdrawalTransaction({
        escrowInputs: [{ txid: prevTx.getId(), vout: 0, value: 500000 }],
        escrowRedeemScript: Buffer.from(redeemScript).toString("hex"),
        timelockInputs: [],
        timelockRedeemScript: Buffer.from(redeemScript).toString("hex"),
        destination: testAddress,
        metadata: JSON.stringify({
          txType: 1,
          subjectId: "550e8400-e29b-41d4-a716-446655440000",
          providerXonlyPubkey: "a".repeat(64),
        }),
        priority: "medium" as any,
      });

      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.txOutputs).toHaveLength(2); // destination + metadata
    });

    test("should reject below dust destination value", async () => {
      const redeemScript = Buffer.from("00", "hex");

      await expect(
        manager.createWithdrawalTransaction({
          escrowInputs: [{ txid: "a".repeat(64), vout: 0, value: 600 }],
          escrowRedeemScript: redeemScript.toString("hex"),
          timelockInputs: [],
          timelockRedeemScript: redeemScript.toString("hex"),
          destination: testAddress,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("below dust threshold");
    });

    test("should reject below dust protocol fee", async () => {
      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        compressed: true,
        network: bitcoin.networks.testnet,
      });

      const redeemScript = bitcoin.script.compile([
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);

      await expect(
        manager.createWithdrawalTransaction({
          escrowInputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
          escrowRedeemScript: Buffer.from(redeemScript).toString("hex"),
          timelockInputs: [],
          timelockRedeemScript: Buffer.from(redeemScript).toString("hex"),
          destination: testAddress,
          feeAddress: testAddress2,
          protocolFeeAmount: 100,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("below dust threshold");
    });

    test("should handle escrow script with expired deadline", async () => {
      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        compressed: true,
        network: bitcoin.networks.testnet,
      });

      const pastTimestamp = Math.floor(Date.now() / 1000) - 86400;
      // Escrow script: OP_IF <timestamp> OP_CLTV OP_DROP <pub> OP_CHECKSIG ...
      const escrowRedeemScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_IF,
        bitcoin.script.number.encode(pastTimestamp),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
        bitcoin.opcodes.OP_ELSE,
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
        bitcoin.opcodes.OP_ENDIF,
      ]);

      const timelockRedeemScript = bitcoin.script.compile([
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);

      // Create fake prev tx with P2SH output for escrow script
      const escrowScriptHash = bitcoin.crypto.hash160(escrowRedeemScript);
      const escrowP2sh = bitcoin.script.compile([
        bitcoin.opcodes.OP_HASH160,
        escrowScriptHash,
        bitcoin.opcodes.OP_EQUAL,
      ]);
      const prevTx = new bitcoin.Transaction();
      prevTx.addInput(Buffer.alloc(32), 0);
      prevTx.addOutput(escrowP2sh, BigInt(100000));

      vi.spyOn(manager.api, "getTransaction").mockResolvedValue(prevTx.toHex());

      const result = await manager.createWithdrawalTransaction({
        escrowInputs: [{ txid: prevTx.getId(), vout: 0, value: 100000 }],
        escrowRedeemScript: Buffer.from(escrowRedeemScript).toString("hex"),
        timelockInputs: [],
        timelockRedeemScript: Buffer.from(timelockRedeemScript).toString("hex"),
        destination: testAddress,
        priority: "medium" as any,
      });

      expect(typeof result).toBe("string");
    });

    test("should reject escrow script with future deadline", async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400;
      const escrowRedeemScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_IF,
        bitcoin.script.number.encode(futureTimestamp),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      ]);

      const timelockRedeemScript = Buffer.from("00", "hex");

      await expect(
        manager.createWithdrawalTransaction({
          escrowInputs: [{ txid: "a".repeat(64), vout: 0, value: 100000 }],
          escrowRedeemScript: Buffer.from(escrowRedeemScript).toString("hex"),
          timelockInputs: [],
          timelockRedeemScript: timelockRedeemScript.toString("hex"),
          destination: testAddress,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("Cannot withdraw from escrow script yet");
    });

    test("should reject timelock script with future deadline", async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400;
      const timelockRedeemScript = bitcoin.script.compile([
        bitcoin.script.number.encode(futureTimestamp),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      ]);

      const escrowRedeemScript = Buffer.from("00", "hex");

      await expect(
        manager.createWithdrawalTransaction({
          escrowInputs: [{ txid: "a".repeat(64), vout: 0, value: 100000 }],
          escrowRedeemScript: escrowRedeemScript.toString("hex"),
          timelockInputs: [],
          timelockRedeemScript:
            Buffer.from(timelockRedeemScript).toString("hex"),
          destination: testAddress,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("Cannot withdraw from timelock script yet");
    });

    test("should handle timelock script with expired deadline and set locktime", async () => {
      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        compressed: true,
        network: bitcoin.networks.testnet,
      });

      const pastTimestamp = Math.floor(Date.now() / 1000) - 86400;
      // Timelock script: <4-byte-push> <timestamp> OP_CLTV OP_DROP <pub> OP_CHECKSIG
      const timelockRedeemScript = bitcoin.script.compile([
        bitcoin.script.number.encode(pastTimestamp),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);

      const escrowRedeemScript = bitcoin.script.compile([
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);

      // Create fake prev tx with P2SH output for timelock script
      const timelockScriptHash = bitcoin.crypto.hash160(timelockRedeemScript);
      const timelockP2sh = bitcoin.script.compile([
        bitcoin.opcodes.OP_HASH160,
        timelockScriptHash,
        bitcoin.opcodes.OP_EQUAL,
      ]);
      const prevTx = new bitcoin.Transaction();
      prevTx.addInput(Buffer.alloc(32), 0);
      prevTx.addOutput(timelockP2sh, BigInt(200000));

      vi.spyOn(manager.api, "getTransaction").mockResolvedValue(prevTx.toHex());

      // Provide escrowAddress and timelockAddress explicitly since addresses are computed from scripts
      const escrowP2sh = bitcoin.payments.p2sh({
        redeem: {
          output: escrowRedeemScript,
          network: bitcoin.networks.testnet,
        },
        network: bitcoin.networks.testnet,
      });
      const timelockP2sh2 = bitcoin.payments.p2sh({
        redeem: {
          output: timelockRedeemScript,
          network: bitcoin.networks.testnet,
        },
        network: bitcoin.networks.testnet,
      });

      const result = await manager.createWithdrawalTransaction({
        escrowInputs: [],
        escrowAddress: escrowP2sh.address!,
        escrowRedeemScript: Buffer.from(escrowRedeemScript).toString("hex"),
        timelockInputs: [{ txid: prevTx.getId(), vout: 0, value: 200000 }],
        timelockAddress: timelockP2sh2.address!,
        timelockRedeemScript: Buffer.from(timelockRedeemScript).toString("hex"),
        destination: testAddress,
        priority: "medium" as any,
      });

      expect(typeof result).toBe("string");
    });
  });

  describe("auto-UTXO selection (mocked API)", () => {
    test("should auto-select UTXOs from address for staking", async () => {
      vi.spyOn(manager.api, "getAddressUtxos").mockResolvedValue([
        {
          txid: "c".repeat(64),
          vout: 0,
          value: 1000000,
          status: { confirmed: true, block_height: 100 },
        },
        {
          txid: "d".repeat(64),
          vout: 1,
          value: 500000,
          status: { confirmed: true, block_height: 101 },
        },
      ]);

      const result = await manager.createDepositTransaction({
        sourceAddress: testAddress,
        escrowAddress: testAddress,
        escrowAmount: 100000,
        timelockAddress: testAddress2,
        timelockAmount: 200000,
        priority: "medium" as any,
      });

      expect(typeof result).toBe("string");
      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.inputCount).toBeGreaterThanOrEqual(1);
    });

    test("should throw when no confirmed UTXOs available", async () => {
      vi.spyOn(manager.api, "getAddressUtxos").mockResolvedValue([
        {
          txid: "e".repeat(64),
          vout: 0,
          value: 1000000,
          status: { confirmed: false },
        },
      ]);

      await expect(
        manager.createDepositTransaction({
          sourceAddress: testAddress,
          escrowAddress: testAddress,
          escrowAmount: 100000,
          timelockAddress: testAddress2,
          timelockAmount: 200000,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("No confirmed UTXOs available");
    });

    test("should auto-select UTXOs for calculateDepositAmounts", async () => {
      vi.spyOn(manager.api, "getAddressUtxos").mockResolvedValue([
        {
          txid: "f".repeat(64),
          vout: 0,
          value: 500000,
          status: { confirmed: true, block_height: 100 },
        },
      ]);

      const result = await manager.calculateDepositAmounts({
        sourceAddress: testAddress,
        desiredEscrowAmount: 100000,
        desiredTimelockAmount: 200000,
      });

      expect(result.totalInputValue).toBe(500000);
      expect(result.feasible).toBe(true);
    });

    test("should use all UTXOs when selection fails for calculation", async () => {
      vi.spyOn(manager.api, "getAddressUtxos").mockResolvedValue([
        {
          txid: "g".repeat(64),
          vout: 0,
          value: 1000,
          status: { confirmed: true, block_height: 100 },
        },
      ]);

      const result = await manager.calculateDepositAmounts({
        sourceAddress: testAddress,
        desiredEscrowAmount: 100000,
        desiredTimelockAmount: 200000,
      });

      expect(result.feasible).toBe(false);
      expect(result.recommendation).toContain("Insufficient funds");
    });

    test("should auto-fetch UTXOs for withdrawal", async () => {
      const ecc = (tinysecp as any).default || tinysecp;
      const ECPair = ECPairFactory(ecc);
      const kp = ECPair.makeRandom({
        compressed: true,
        network: bitcoin.networks.testnet,
      });

      const redeemScript = bitcoin.script.compile([
        kp.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]);

      // Create two distinct fake prev txs
      const scriptHash = bitcoin.crypto.hash160(redeemScript);
      const p2shScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_HASH160,
        scriptHash,
        bitcoin.opcodes.OP_EQUAL,
      ]);

      const prevTx1 = new bitcoin.Transaction();
      prevTx1.addInput(Buffer.alloc(32), 0);
      prevTx1.addOutput(p2shScript, BigInt(100000));

      const prevTx2 = new bitcoin.Transaction();
      prevTx2.addInput(Buffer.alloc(32), 1); // different index to get different txid
      prevTx2.addOutput(p2shScript, BigInt(200000));

      vi.spyOn(manager.api, "getAddressUtxos").mockResolvedValue([
        {
          txid: prevTx1.getId(),
          vout: 0,
          value: 100000,
          status: { confirmed: true, block_height: 100 },
        },
      ]);
      vi.spyOn(manager.api, "getTransaction").mockImplementation(
        async (txid: string) => {
          if (txid === prevTx1.getId()) return prevTx1.toHex();
          return prevTx2.toHex();
        },
      );

      const result = await manager.createWithdrawalTransaction({
        escrowRedeemScript: Buffer.from(redeemScript).toString("hex"),
        timelockInputs: [{ txid: prevTx2.getId(), vout: 0, value: 200000 }],
        timelockRedeemScript: Buffer.from(redeemScript).toString("hex"),
        destination: testAddress,
        priority: "medium" as any,
      });

      expect(typeof result).toBe("string");
    });

    test("should throw when fetching escrow UTXOs fails", async () => {
      const redeemScript = Buffer.from("00", "hex");

      vi.spyOn(manager.api, "getAddressUtxos").mockRejectedValue(
        new Error("network error"),
      );

      await expect(
        manager.createWithdrawalTransaction({
          escrowRedeemScript: redeemScript.toString("hex"),
          timelockInputs: [{ txid: "j".repeat(64), vout: 0, value: 200000 }],
          timelockRedeemScript: redeemScript.toString("hex"),
          destination: testAddress,
          priority: "medium" as any,
        }),
      ).rejects.toThrow("Failed to fetch escrow UTXOs");
    });
  });
});
