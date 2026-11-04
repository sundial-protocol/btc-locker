import { describe, test, expect, beforeAll, vi } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import tinysecp from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import { TransactionManager } from "../src/locker/transaction-manager";
import { NETWORKS } from "../src/utils/network";
import LocktimeUtils from "../src/utils/locktime";

const tip = { height: 900_000, medianTimePast: 1_800_000_000 };

describe("LocktimeUtils", () => {
  test("a height locktime is final once the tip reaches it", () => {
    expect(LocktimeUtils.isFinal(900_000, tip)).toBe(true);
    expect(LocktimeUtils.isFinal(900_001, tip)).toBe(false);
  });

  test("a time locktime is final only once median time past is past it", () => {
    expect(LocktimeUtils.isFinal(1_799_999_999, tip)).toBe(true);
    expect(LocktimeUtils.isFinal(1_800_000_000, tip)).toBe(false);
  });

  test("500,000,000 is the first time locktime", () => {
    expect(LocktimeUtils.isHeight(499_999_999)).toBe(true);
    expect(LocktimeUtils.isHeight(500_000_000)).toBe(false);
  });

  test("asks the API only for what the locktimes need", async () => {
    const api = { getChainTip: vi.fn().mockResolvedValue({ ...tip, hash: "" }) };
    await LocktimeUtils.tipFor(api, [0]);
    await LocktimeUtils.tipFor(api, [1_700_000_000], { medianTimePast: 1 });
    await LocktimeUtils.tipFor(api, [800_000], { height: 1 });
    expect(api.getChainTip).not.toHaveBeenCalled();

    expect(await LocktimeUtils.tipFor(api, [800_000], { medianTimePast: 5 })).toEqual({
      height: tip.height,
      medianTimePast: 5,
    });
    expect(api.getChainTip).toHaveBeenCalledTimes(1);
  });
});

describe("builders check locktimes against the chain, not the clock", () => {
  let txManager: TransactionManager;
  let key: ReturnType<ReturnType<typeof ECPairFactory>["makeRandom"]>;
  let address: string;
  const now = Math.floor(Date.now() / 1000);

  const timelock = (locktime: number) =>
    Buffer.from(
      bitcoin.script.compile([
        bitcoin.script.number.encode(locktime),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        key.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]),
    ).toString("hex");

  const spend = (redeemScript: string, chainTip?: { height?: number; medianTimePast?: number }) =>
    txManager.createSpendingTransaction({
      inputs: [{ txid: "a".repeat(64), vout: 0, value: 100_000 }],
      outputs: [{ address, value: 95_000 }],
      redeemScript,
      chainTip,
    });

  beforeAll(async () => {
    const ecc = (tinysecp as any).default || tinysecp;
    bitcoin.initEccLib(ecc);
    key = ECPairFactory(ecc).makeRandom({ network: bitcoin.networks.testnet });
    address = bitcoin.payments.p2wpkh({
      pubkey: key.publicKey,
      network: bitcoin.networks.testnet,
    }).address!;
    txManager = new TransactionManager(NETWORKS.testnet);
    await txManager.init();
    // The clock is past the deadlines below; median time past, an hour behind, is not.
    vi.spyOn(txManager.api, "getChainTip").mockResolvedValue({
      height: 900_000,
      hash: "0".repeat(64),
      medianTimePast: now - 3_600,
    });
  });

  test("a time locktime the clock has passed but median time past has not", async () => {
    await expect(spend(timelock(now - 60))).rejects.toThrow(
      /Timelock has not expired yet\. Median time past: \d+, Locktime: \d+/,
    );
    await expect(spend(timelock(now - 7_200))).resolves.toBeTypeOf("string");
  });

  test("a height locktime above the tip", async () => {
    await expect(spend(timelock(900_001))).rejects.toThrow(
      "Chain height: 900000, Locktime: block 900001",
    );
    await expect(spend(timelock(900_000))).resolves.toBeTypeOf("string");
  });

  test("a chain tip passed in is used instead of the API's", async () => {
    await expect(spend(timelock(900_001), { height: 900_001 })).resolves.toBeTypeOf("string");
    await expect(spend(timelock(now - 60), { medianTimePast: now })).resolves.toBeTypeOf("string");
  });

  test("withdrawal checks a height deadline against the tip", async () => {
    await expect(
      txManager.createWithdrawalTransaction({
        escrowInputs: [{ txid: "a".repeat(64), vout: 0, value: 100_000 }],
        escrowRedeemScript: timelock(900_001),
        timelockInputs: [],
        timelockRedeemScript: "00",
        destination: address,
      }),
    ).rejects.toThrow("Cannot withdraw from escrow script yet. Chain height: 900000");
  });
});
