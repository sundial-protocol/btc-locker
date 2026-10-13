import { afterEach, describe, expect, test, vi } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import { BitcoinAPI, FeePriorities, NETWORKS } from "@sundial-protocol/btc-provider";
import { Solstice } from "../src/solstice";
import { createEtchCommitment } from "../src/tx/etch-commit";
import { buildSwapTransaction } from "../src/tx/swap";
import type { ReceiptRune } from "../src/receipt/receipt-rune";
import { NETWORK, p2wpkh, txid } from "./helpers";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const rune: ReceiptRune = {
  name: "SOLSTICERECEIPT",
  displayTicker: "RT",
  divisibility: 8,
  totalSupply: 2_100_000_000_000_000n,
};

const admin = ECPair.fromPrivateKey(Buffer.alloc(32, 7), { network: NETWORK });
const adminXOnly = Buffer.from(admin.publicKey.subarray(1));
const vault = p2wpkh(1);
const funding = p2wpkh(2);

const FEE_RATE = 2;
const TIP = 1_000;

/** A confirmed UTXO as the chain API reports it. */
const confirmed = (tag: number, value: number) => ({
  txid: txid(tag),
  vout: 0,
  value,
  status: { confirmed: true, block_height: 900 },
});

/** A transaction whose output 0 is `scriptHex`, as hex. */
function txPaying(scriptHex: string, value: number): { hex: string; id: string } {
  const tx = new bitcoin.Transaction();
  tx.addInput(Buffer.alloc(32, 9), 0);
  tx.addOutput(Buffer.from(scriptHex, "hex"), BigInt(value));
  return { hex: tx.toHex(), id: tx.getId() };
}

/**
 * A chain with one address's UTXOs and one known transaction, behind the
 * BitcoinAPI method names Solstice calls.
 */
function fakeChain(options: {
  utxos?: ReturnType<typeof confirmed>[];
  tx?: { hex: string; id: string };
  /** Height of the block that confirmed `tx`; omit for unconfirmed. */
  txHeight?: number;
  /** The rate the chain reports for any priority (default 5). */
  chainFeeRate?: number;
} = {}) {
  const api = {
    queryChainFeeRates: vi.fn(async () => options.chainFeeRate ?? 5),
    fetchConfirmedUtxos: vi.fn(async () => options.utxos ?? []),
    getTransaction: vi.fn(async (id: string) => {
      if (id !== options.tx?.id) throw new Error("Transaction not found");
      return options.tx.hex;
    }),
    makeRequest: vi.fn(async () =>
      options.txHeight === undefined
        ? { confirmed: false }
        : { confirmed: true, block_height: options.txHeight },
    ),
    getBlockHeight: vi.fn(async () => TIP),
    broadcastTransaction: vi.fn(async () => ({ txid: "from-provider" })),
  };
  return { api, solstice: new Solstice(NETWORKS.testnet, api as unknown as BitcoinAPI) };
}

const inputsOf = (psbtBase64: string) =>
  bitcoin.Psbt.fromBase64(psbtBase64, { network: NETWORK }).txInputs.map((i) =>
    Buffer.from(i.hash).reverse().toString("hex"),
  );

afterEach(() => vi.restoreAllMocks());

describe("Solstice", () => {
  describe("constructor", () => {
    test("takes a network name and creates a default API for it", () => {
      const solstice = new Solstice("testnet4");
      expect(solstice.networkType).toBe(NETWORKS.testnet4);
      expect(solstice.network).toBe(NETWORKS.testnet4.info);
      expect(solstice.api).toBeInstanceOf(BitcoinAPI);
      expect(solstice.api.networkType).toBe(NETWORKS.testnet4);
    });

    test("defaults to testnet", () => {
      expect(new Solstice().networkType).toBe(NETWORKS.testnet);
    });

    test("keeps the API it is given", () => {
      const api = new BitcoinAPI("bitcoin", "blockstream");
      const solstice = new Solstice(NETWORKS.bitcoin, api);
      expect(solstice.api).toBe(api);
    });

    test("throws for an unknown network", () => {
      expect(() => new Solstice("signet")).toThrow("Unknown network: signet");
    });

    test("accepts regtest only with an API, as the locker does", () => {
      expect(() => new Solstice("regtest")).toThrow("Regtest network is not supported");
      const { api } = fakeChain();
      const solstice = new Solstice("regtest", api as unknown as BitcoinAPI);
      expect(solstice.network.bech32).toBe("bcrt");
    });
  });

  describe("getConfirmations", () => {
    test("is 0 while unconfirmed, without asking for the tip", async () => {
      const { api, solstice } = fakeChain();
      expect(await solstice.getConfirmations(txid(5))).toBe(0);
      expect(api.makeRequest).toHaveBeenCalledWith(`/tx/${txid(5)}/status`);
      expect(api.getBlockHeight).not.toHaveBeenCalled();
    });

    test("counts the confirming block", async () => {
      const { solstice } = fakeChain({ txHeight: TIP });
      expect(await solstice.getConfirmations(txid(5))).toBe(1);
      expect(await fakeChain({ txHeight: TIP - 5 }).solstice.getConfirmations(txid(5))).toBe(6);
    });
  });

  describe("getFeeRate", () => {
    test("asks its own API, so that API's providers and fallback apply", async () => {
      const { api, solstice } = fakeChain({ chainFeeRate: 7 });
      expect(await solstice.getFeeRate(FeePriorities.HIGH)).toBe(7);
      expect(api.queryChainFeeRates).toHaveBeenCalledWith(FeePriorities.HIGH);
    });

    test("defaults to the medium priority", async () => {
      const { api, solstice } = fakeChain();
      await solstice.getFeeRate();
      expect(api.queryChainFeeRates).toHaveBeenCalledWith(FeePriorities.MEDIUM);
    });
  });

  describe("broadcastTransaction", () => {
    const { hex, id } = txPaying(vault.scriptHex, 1_000);

    test("returns the provider's txid", async () => {
      const { api, solstice } = fakeChain();
      expect(await solstice.broadcastTransaction(hex)).toBe("from-provider");
      expect(api.broadcastTransaction).toHaveBeenCalledWith(hex);
    });

    test("falls back to the transaction's own id", async () => {
      const { api, solstice } = fakeChain();
      api.broadcastTransaction.mockResolvedValue({ txid: "" });
      expect(await solstice.broadcastTransaction(hex)).toBe(id);
    });
  });

  describe("buildEtchCommitTransaction", () => {
    const base = { rune, revealPublicKey: adminXOnly, feeRate: FEE_RATE };

    test("funds from sourceAddress with the largest UTXO that covers it", async () => {
      const { api, solstice } = fakeChain({
        utxos: [confirmed(1, 600), confirmed(2, 50_000), confirmed(3, 20_000)],
      });
      const res = await solstice.buildEtchCommitTransaction({
        ...base,
        sourceAddress: funding.address,
      });

      expect(api.fetchConfirmedUtxos).toHaveBeenCalledWith(funding.address);
      expect(inputsOf(res.psbtBase64)).toEqual([txid(2)]);
      expect(res.outputs.map((o) => [o.role, o.address])).toEqual([
        ["etch commit", res.commitment.address],
        ["btc change", funding.address],
      ]);
    });

    test("adds UTXOs, largest first, until the commit is covered", async () => {
      const { solstice } = fakeChain({
        utxos: [confirmed(1, 700), confirmed(2, 900), confirmed(3, 800)],
      });
      const res = await solstice.buildEtchCommitTransaction({
        ...base,
        sourceAddress: funding.address,
      });
      // 900 alone is short; 900 + 800 covers it, so the 700 is left alone.
      expect(inputsOf(res.psbtBase64)).toEqual([txid(2), txid(3)]);
    });

    test("uses the inputs it is given and does not ask the chain", async () => {
      const { api, solstice } = fakeChain({ utxos: [confirmed(2, 50_000)] });
      const res = await solstice.buildEtchCommitTransaction({
        ...base,
        inputs: [{ txid: txid(8), vout: 1, value: 30_000, scriptPubKey: funding.scriptHex }],
        changeAddress: funding.address,
      });
      expect(inputsOf(res.psbtBase64)).toEqual([txid(8)]);
      expect(api.fetchConfirmedUtxos).not.toHaveBeenCalled();
    });

    test("asks the chain for a fee rate when none is given", async () => {
      const { api, solstice } = fakeChain({ utxos: [confirmed(2, 50_000)], chainFeeRate: 3 });
      const query = api.queryChainFeeRates;
      const withRate = await solstice.buildEtchCommitTransaction({
        ...base,
        feeRate: 3,
        sourceAddress: funding.address,
      });
      const asked = await solstice.buildEtchCommitTransaction({
        rune,
        revealPublicKey: adminXOnly,
        priority: FeePriorities.LOW,
        sourceAddress: funding.address,
      });
      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith(FeePriorities.LOW);
      expect(asked.fee).toBe(withRate.fee);
    });

    test("throws without inputs or a sourceAddress", async () => {
      await expect(fakeChain().solstice.buildEtchCommitTransaction(base)).rejects.toThrow(
        "either inputs or sourceAddress must be provided",
      );
    });

    test("throws when the address has no confirmed UTXOs", async () => {
      await expect(
        fakeChain().solstice.buildEtchCommitTransaction({ ...base, sourceAddress: funding.address }),
      ).rejects.toThrow(`no confirmed UTXOs at the funding address ${funding.address}`);
    });

    test("throws when the address cannot cover the commit", async () => {
      const { solstice } = fakeChain({ utxos: [confirmed(1, 600)] });
      await expect(
        solstice.buildEtchCommitTransaction({ ...base, sourceAddress: funding.address }),
      ).rejects.toThrow("insufficient funds");
    });
  });

  describe("buildEtchTransaction", () => {
    const commitment = createEtchCommitment(rune, adminXOnly, NETWORK);
    const commitTx = txPaying(commitment.scriptPubKeyHex, 10_000);
    const commit = { txid: commitTx.id, revealPublicKey: adminXOnly };
    const base = { rune, vaultAddress: vault.address, commit, feeRate: FEE_RATE };
    /** A chain where the commit has `n` confirmations. */
    const chain = (n: number, extra: Parameters<typeof fakeChain>[0] = {}) =>
      fakeChain({ tx: commitTx, txHeight: n > 0 ? TIP - n + 1 : undefined, ...extra });

    test("spends the commit output, reading its value from the chain", async () => {
      const { api, solstice } = chain(5);
      const res = await solstice.buildEtchTransaction(base);

      expect(api.getTransaction).toHaveBeenCalledWith(commitTx.id);
      const psbt = bitcoin.Psbt.fromBase64(res.psbtBase64, { network: NETWORK });
      expect(inputsOf(res.psbtBase64)).toEqual([commitTx.id]);
      expect(psbt.data.inputs[0].witnessUtxo?.value).toBe(10_000n);
      expect(res.outputs[0]).toMatchObject({ role: "vault (premine)", address: vault.address });
      // No source address: nothing was fetched and everything above the vault output is the fee.
      expect(api.fetchConfirmedUtxos).not.toHaveBeenCalled();
      expect(res.fee).toBe(10_000 - 546);
    });

    test.each([0, 1, 4])("refuses while the commit has %i confirmation(s)", async (n) => {
      await expect(chain(n).solstice.buildEtchTransaction(base)).rejects.toThrow(
        `the commit has ${n} confirmation(s); wait for 5 before etching`,
      );
    });

    test("refuses a commit made for another name", async () => {
      await expect(
        chain(5).solstice.buildEtchTransaction({ ...base, rune: { ...rune, name: "OTHERNAME" } }),
      ).rejects.toThrow(`${commitTx.id}:0 does not commit to OTHERNAME with this key`);
    });

    test("refuses a commit made for another key", async () => {
      const other = Buffer.from(
        ECPair.fromPrivateKey(Buffer.alloc(32, 8), { network: NETWORK }).publicKey.subarray(1),
      );
      await expect(
        chain(5).solstice.buildEtchTransaction({
          ...base,
          commit: { ...commit, revealPublicKey: other },
        }),
      ).rejects.toThrow("does not commit to SOLSTICERECEIPT with this key");
    });

    test("refuses an output index the commit transaction does not have", async () => {
      await expect(
        chain(5).solstice.buildEtchTransaction({ ...base, commit: { ...commit, vout: 3 } }),
      ).rejects.toThrow(`${commitTx.id}:3 does not commit to`);
    });

    describe("when fees rose since the commit", () => {
      const HIGH_RATE = 100;

      test("tops up from sourceAddress and returns the change there", async () => {
        const { api, solstice } = chain(5, { utxos: [confirmed(4, 200_000)] });
        const res = await solstice.buildEtchTransaction({
          ...base,
          feeRate: HIGH_RATE,
          sourceAddress: funding.address,
        });
        expect(api.fetchConfirmedUtxos).toHaveBeenCalledWith(funding.address);
        expect(inputsOf(res.psbtBase64)).toEqual([commitTx.id, txid(4)]);
        expect(res.outputs.at(-1)).toMatchObject({ role: "btc change", address: funding.address });
      });

      test("is an error without a sourceAddress", async () => {
        await expect(
          chain(5).solstice.buildEtchTransaction({ ...base, feeRate: HIGH_RATE }),
        ).rejects.toThrow("etch: insufficient funds");
      });
    });
  });

  describe("swaps", () => {
    const etched: ReceiptRune = { ...rune, id: { block: 840_000n, tx: 7n } };
    const investor = p2wpkh(3);
    const yp = p2wpkh(4);
    const legs = {
      rune: etched,
      rt: {
        inputs: [
          { txid: txid(1), vout: 0, value: 1_000, scriptPubKey: vault.scriptHex, runeAmount: 1_000_000n },
        ],
        amount: 400_000n,
        recipientAddress: investor.address,
        changeAddress: vault.address,
      },
      btc: {
        inputs: [{ txid: txid(2), vout: 1, value: 100_000, scriptPubKey: investor.scriptHex }],
        amount: 90_000,
        recipientAddress: yp.address,
        changeAddress: investor.address,
      },
    };

    test("build the same transaction as the pure builder on this network", async () => {
      const { api, solstice } = fakeChain();
      const res = await solstice.buildSwapTransaction({ ...legs, feeRate: 5 });
      expect(res).toEqual(buildSwapTransaction({ ...legs, feeRate: 5, network: NETWORK }));
      // Swap inputs are the caller's: the chain is not asked for any.
      expect(api.fetchConfirmedUtxos).not.toHaveBeenCalled();
    });

    test("ask the chain for a fee rate when none is given", async () => {
      const res = await fakeChain({ chainFeeRate: 5 }).solstice.buildSwapTransaction(legs);
      expect(res.fee).toBe(buildSwapTransaction({ ...legs, feeRate: 5, network: NETWORK }).fee);
    });

    test("invest and withdraw map onto the same swap", async () => {
      const { solstice } = fakeChain();
      const invest = await solstice.buildInvestTransaction({
        rune: etched,
        vaultRtInputs: legs.rt.inputs,
        rtAmount: legs.rt.amount,
        investorRtAddress: investor.address,
        vaultRtChangeAddress: vault.address,
        investorBtcInputs: legs.btc.inputs,
        btcAmount: legs.btc.amount,
        ypDeploymentAddress: yp.address,
        investorBtcChangeAddress: investor.address,
        feeRate: 5,
      });
      const withdraw = await solstice.buildWithdrawTransaction({
        rune: etched,
        userRtInputs: legs.rt.inputs,
        rtAmount: legs.rt.amount,
        vaultRtAddress: investor.address,
        userRtChangeAddress: vault.address,
        bufferBtcInputs: legs.btc.inputs,
        btcAmount: legs.btc.amount,
        userBtcAddress: yp.address,
        bufferBtcChangeAddress: investor.address,
        feeRate: 5,
      });
      const swap = buildSwapTransaction({ ...legs, feeRate: 5, network: NETWORK });
      expect(invest.psbtBase64).toBe(swap.psbtBase64);
      expect(withdraw.psbtBase64).toBe(swap.psbtBase64);
    });
  });
});
