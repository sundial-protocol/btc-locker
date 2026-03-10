import { describe, test, expect, beforeAll, vi } from "vitest";
import { YieldDistributor } from "../src/locker/yield";
import { NETWORKS } from "../src/utils/network";
import * as bitcoin from "bitcoinjs-lib";
import tinysecp from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import FeeUtils from "../src/utils/fees";

describe("YieldDistributor", () => {
  let distributor: YieldDistributor;
  let testAddress: string;

  beforeAll(async () => {
    const ecc = (tinysecp as any).default || tinysecp;
    bitcoin.initEccLib(ecc);
    const ECPair = ECPairFactory(ecc);
    const keyPair = ECPair.makeRandom({
      compressed: true,
      network: bitcoin.networks.testnet,
    });
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: bitcoin.networks.testnet,
    });
    testAddress = address!;

    distributor = new YieldDistributor(NETWORKS.testnet);
    await distributor.init();
  });

  describe("distributeYield", () => {
    test("should throw error when no inputs and no sourceAddress+api", async () => {
      await expect(
        distributor.distributeYield({
          timelockAddress: testAddress,
          amount: 10000,
        }),
      ).rejects.toThrow(
        "Either inputs or both sourceAddress and api must be provided",
      );
    });

    test("should throw error when sourceAddress given but no api", async () => {
      await expect(
        distributor.distributeYield({
          sourceAddress: testAddress,
          timelockAddress: testAddress,
          amount: 10000,
        }),
      ).rejects.toThrow(
        "Either inputs or both sourceAddress and api must be provided",
      );
    });

    test("should throw error when empty inputs array", async () => {
      await expect(
        distributor.distributeYield({
          inputs: [],
          timelockAddress: testAddress,
          amount: 10000,
        }),
      ).rejects.toThrow("No confirmed UTXOs available");
    });
  });
});

describe("YieldDistributor (mocked fees)", () => {
  let distributor: YieldDistributor;
  let testAddress: string;
  let testAddress2: string;
  let ECPair: ReturnType<typeof ECPairFactory>;
  let testKeyPair: ReturnType<ReturnType<typeof ECPairFactory>["makeRandom"]>;

  beforeAll(async () => {
    const ecc = (tinysecp as any).default || tinysecp;
    bitcoin.initEccLib(ecc);
    ECPair = ECPairFactory(ecc);
    testKeyPair = ECPair.makeRandom({
      compressed: true,
      network: bitcoin.networks.testnet,
    });
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: testKeyPair.publicKey,
      network: bitcoin.networks.testnet,
    });
    testAddress = address!;

    const kp2 = ECPair.makeRandom({
      compressed: true,
      network: bitcoin.networks.testnet,
    });
    testAddress2 = bitcoin.payments.p2wpkh({
      pubkey: kp2.publicKey,
      network: bitcoin.networks.testnet,
    }).address!;

    vi.spyOn(FeeUtils, "queryChainFeeRates").mockResolvedValue(10);

    distributor = new YieldDistributor(NETWORKS.testnet);
    await distributor.init();
  });

  describe("distributeYield (happy path)", () => {
    test("should create unsigned PSBT with provided inputs", async () => {
      const result = await distributor.distributeYield({
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 100000 }],
        timelockAddress: testAddress,
        amount: 50000,
      });

      expect(typeof result).toBe("string");
      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.inputCount).toBe(1);
      // At least the yield output
      expect(psbt.txOutputs.length).toBeGreaterThanOrEqual(1);
    });

    test("should include change output when above dust", async () => {
      const result = await distributor.distributeYield({
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
        timelockAddress: testAddress,
        amount: 50000,
        changeAddress: testAddress2,
      });

      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      // yield output + change output
      expect(psbt.txOutputs.length).toBeGreaterThanOrEqual(2);
    });

    test("should include metadata output", async () => {
      const result = await distributor.distributeYield({
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
        timelockAddress: testAddress,
        amount: 50000,
        metadata: JSON.stringify({
          txType: 1,
          depositId: "550e8400-e29b-41d4-a716-446655440000",
          providerXonlyPubkey: "a".repeat(64),
        }),
      });

      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      // yield output + metadata OP_RETURN
      expect(psbt.txOutputs.length).toBeGreaterThanOrEqual(2);
    });

    test("should handle multiple inputs", async () => {
      const result = await distributor.distributeYield({
        inputs: [
          { txid: "a".repeat(64), vout: 0, value: 30000 },
          { txid: "b".repeat(64), vout: 1, value: 40000 },
        ],
        timelockAddress: testAddress,
        amount: 50000,
      });

      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.inputCount).toBe(2);
    });

    test("should fetch UTXOs from API when sourceAddress and api provided", async () => {
      const mockApi = {
        getAddressUtxos: vi.fn().mockResolvedValue([
          {
            txid: "c".repeat(64),
            vout: 0,
            value: 200000,
            status: { confirmed: true, block_height: 100 },
          },
          {
            txid: "d".repeat(64),
            vout: 0,
            value: 50000,
            status: { confirmed: false },
          },
        ]),
      };

      const result = await distributor.distributeYield({
        sourceAddress: testAddress,
        api: mockApi as any,
        timelockAddress: testAddress,
        amount: 50000,
      });

      expect(typeof result).toBe("string");
      expect(mockApi.getAddressUtxos).toHaveBeenCalledWith(testAddress);
      // Only confirmed UTXOs should be used
      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.inputCount).toBe(1); // Only the confirmed one
    });
  });

  describe("signAndSubmitYieldDistribution", () => {
    test("should sign and submit yield distribution", async () => {
      // First create an unsigned PSBT
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: testKeyPair.publicKey,
        network: bitcoin.networks.testnet,
      });
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      psbt.addInput({
        hash: "a".repeat(64),
        index: 0,
        witnessUtxo: { script: p2wpkh.output!, value: BigInt(100000) },
      });
      psbt.addOutput({ address: testAddress, value: BigInt(50000) });
      psbt.addOutput({ address: testAddress2, value: BigInt(45000) });

      // Mock submitTransaction to avoid broadcast
      vi.spyOn(distributor, "submitTransaction").mockResolvedValue(
        "mock-txid-123",
      );

      const result = await distributor.signAndSubmitYieldDistribution({
        unsignedTransaction: psbt.toBase64(),
        privateKey: testKeyPair.privateKey!.toString("hex"),
      });

      expect(result.txid).toBe("mock-txid-123");
      expect(result.hex).toBeDefined();
      expect(result.distribution.amount).toBeGreaterThan(0);
      expect(result.fee).toBeGreaterThan(0);
      expect(result.size).toBeGreaterThan(0);
    });

    test("should include metadata in result", async () => {
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: testKeyPair.publicKey,
        network: bitcoin.networks.testnet,
      });
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      psbt.addInput({
        hash: "a".repeat(64),
        index: 0,
        witnessUtxo: { script: p2wpkh.output!, value: BigInt(100000) },
      });
      psbt.addOutput({ address: testAddress, value: BigInt(90000) });

      vi.spyOn(distributor, "submitTransaction").mockResolvedValue("txid-456");

      const result = await distributor.signAndSubmitYieldDistribution(
        {
          unsignedTransaction: psbt.toBase64(),
          privateKey: testKeyPair.privateKey!.toString("hex"),
        },
        "Custom metadata",
      );

      expect(result.metadata).toBe("Custom metadata");
    });
  });
});
