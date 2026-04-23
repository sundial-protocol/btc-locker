import { describe, test, expect, beforeAll, vi } from "vitest";
import { TransactionManager } from "../src/locker/transaction-manager";
import { NETWORKS } from "../src/utils/network";
import * as bitcoin from "bitcoinjs-lib";
import tinysecp from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import FeeUtils from "../src/utils/fees";

describe("YieldDistributor", () => {
  let txManager: TransactionManager;
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

    txManager = new TransactionManager(NETWORKS.testnet);
    await txManager.init();
  });

  describe("createDistributionTransaction", () => {
    test("should throw error when no inputs and no sourceAddress+api", async () => {
      await expect(
        txManager.createDistributionTransaction({
          timelockAddress: testAddress,
          amount: 10000,
        }),
      ).rejects.toThrow(
        "Either inputs or both sourceAddress and api must be provided",
      );
    });

    test("should throw error when sourceAddress given but no api", async () => {
      await expect(
        txManager.createDistributionTransaction({
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
        txManager.createDistributionTransaction({
          inputs: [],
          timelockAddress: testAddress,
          amount: 10000,
        }),
      ).rejects.toThrow("No confirmed UTXOs available");
    });
  });
});

describe("YieldDistributor (mocked fees)", () => {
  let txManager: TransactionManager;
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

    txManager = new TransactionManager(NETWORKS.testnet);
    await txManager.init();
  });

  describe("createDistributionTransaction (happy path)", () => {
    test("should create unsigned PSBT with provided inputs", async () => {
      const result = await txManager.createDistributionTransaction({
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 100000 }],
        sourceAddress: testAddress2,
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
      const result = await txManager.createDistributionTransaction({
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
        sourceAddress: testAddress2,
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
      const result = await txManager.createDistributionTransaction({
        inputs: [{ txid: "a".repeat(64), vout: 0, value: 500000 }],
        sourceAddress: testAddress2,
        timelockAddress: testAddress,
        amount: 50000,
        metadata: JSON.stringify({
          txType: 1,
          subjectId: "550e8400-e29b-41d4-a716-446655440000",
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
      const result = await txManager.createDistributionTransaction({
        inputs: [
          { txid: "a".repeat(64), vout: 0, value: 30000 },
          { txid: "b".repeat(64), vout: 1, value: 40000 },
        ],
        sourceAddress: testAddress2,
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
        fetchConfirmedUtxos: vi.fn().mockResolvedValue([
          {
            txid: "c".repeat(64),
            vout: 0,
            value: 200000,
            status: { confirmed: true, block_height: 100 },
          },
        ]),
      };

      const result = await txManager.createDistributionTransaction({
        sourceAddress: testAddress,
        api: mockApi as any,
        timelockAddress: testAddress,
        amount: 50000,
      });

      expect(typeof result).toBe("string");
      expect(mockApi.fetchConfirmedUtxos).toHaveBeenCalledWith(testAddress);
      // Only confirmed UTXOs should be used
      const psbt = bitcoin.Psbt.fromBase64(result, {
        network: bitcoin.networks.testnet,
      });
      expect(psbt.inputCount).toBe(1); // Only the confirmed one
    });
  });
});
