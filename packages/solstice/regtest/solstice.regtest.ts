/**
 * Solstice on a live chain: bitcoind regtest, indexed by ord with the runes index.
 *
 * Every transaction is built by this package's builders, signed here, broadcast
 * and mined; every expectation is what ord reports afterwards. Start the daemons
 * with `btc-regtest up --ord` (or run everything with `npm run regtest`).
 *
 * The tests run in order and share one chain.
 */

import { beforeAll, describe, expect, test } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import type { UTXO } from "@sundial-protocol/btc-locker";
import {
  ETCH_COMMIT_CONFIRMATIONS,
  buildEtchCommitTransaction,
  buildEtchTransaction,
  buildInvestTransaction,
  buildWithdrawTransaction,
  formatSpacedRune,
  nativeRunestoneCodec,
  receiptEtching,
  type ReceiptRune,
  type RuneId,
  type SwapResult,
} from "../src/index";
import {
  NETWORK,
  heightOf,
  party as partyFor,
  rpc,
  signAndBroadcast,
  utxosOf,
} from "@sundial-protocol/btc-regtest";
import { mine, ord, runeBalances } from "@sundial-protocol/btc-regtest/ord";

/** Keys are derived from these labels, so transaction ids repeat from run to run. */
const party = (name: string) => partyFor(`solstice regtest ${name}`);

const FEE_RATE = 2;
const SUPPLY = 2_100_000_000_000_000n;

const miner = party("miner");
const admin = party("admin"); // funds and signs the etch
const vault = party("vault"); // holds the receipt-token supply
const investor = party("investor");
const yieldProvider = party("yield provider");
const buffer = party("liquidity buffer");

function receiptRune(name: string, spacers?: number): ReceiptRune {
  return {
    name,
    displayTicker: "RT",
    divisibility: 8,
    symbol: 0x24, // $
    spacers,
    totalSupply: SUPPLY,
  };
}

const RECEIPT = receiptRune("SOLSTICERECEIPT", 0b1000_0000);
const RECEIPT_SPACED = formatSpacedRune(RECEIPT.name, RECEIPT.spacers);

interface OrdRune {
  id: string;
  entry: {
    block: number;
    divisibility: number;
    etching: string;
    premine: number | string;
    spaced_rune: string;
    symbol: string | null;
    terms: unknown;
    turbo: boolean;
  };
}

/** Next unspent output of a party that the suite has not used yet. */
const used = new Set<string>();
async function fresh(owner: { address: string }): Promise<UTXO> {
  const utxo = (await utxosOf(owner.address)).find(
    (u) => u.value >= 100_000 && !used.has(`${u.txid}:${u.vout}`),
  );
  if (!utxo) throw new Error(`no spendable output left for ${owner.address}`);
  used.add(`${utxo.txid}:${utxo.vout}`);
  return utxo;
}

/** Commit to `rune` and mine the commit. Returns what the reveal needs. */
async function commit(rune: ReceiptRune) {
  const built = buildEtchCommitTransaction({
    rune,
    revealPublicKey: admin.xOnly,
    inputs: [await fresh(admin)],
    changeAddress: admin.address,
    feeRate: FEE_RATE,
    network: NETWORK,
  });
  const txid = await signAndBroadcast(built.psbtBase64, [admin]);
  return { txid, vout: built.commitVout, value: built.commitOutputValue };
}

async function reveal(rune: ReceiptRune, commitOutput: { txid: string; vout: number; value: number }) {
  const built = buildEtchTransaction({
    rune,
    vaultAddress: vault.address,
    commit: { ...commitOutput, revealPublicKey: admin.xOnly },
    feeRate: FEE_RATE,
    network: NETWORK,
  });
  return signAndBroadcast(built.psbtBase64, [admin]);
}

/** What ord reports for each output of a swap, in the builder's output order. */
async function balancesByRole(txid: string, plan: SwapResult): Promise<Record<string, bigint>> {
  const result: Record<string, bigint> = {};
  for (const [vout, output] of plan.outputs.entries()) {
    if (output.role === "runestone") continue;
    result[output.role] = (await runeBalances(txid, vout))[RECEIPT_SPACED] ?? 0n;
  }
  return result;
}

describe("Solstice receipt rune on regtest, as indexed by ord", () => {
  let receipt: ReceiptRune & { id: RuneId };
  let vaultRt: { txid: string; vout: number; value: number; scriptPubKey: string; runeAmount: bigint };
  let investorRt: typeof vaultRt;

  beforeAll(async () => {
    const info = await ord<{ rune_index: boolean; chain: string }>("/status");
    expect(info?.chain).toBe("regtest");
    expect(info?.rune_index).toBe(true);

    // Coinbases for everyone who pays for something, then 100 blocks to mature them.
    for (const p of [admin, investor, buffer]) await rpc("generatetoaddress", 6, p.address);
    await mine(100, miner);
  });

  test("an etching with no commitment is ignored by ord", async () => {
    // What buildEtchTransaction produced before the commit/reveal flow existed:
    // the same runestone, in a transaction with ordinary inputs only.
    const rune = receiptRune("SOLSTICENOCOMMIT");
    const input = await fresh(admin);
    const runestone = nativeRunestoneCodec.encipher({ etching: receiptEtching(rune), pointer: 0 });

    const psbt = new bitcoin.Psbt({ network: NETWORK });
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: { script: Buffer.from(input.scriptPubKey!, "hex"), value: BigInt(input.value) },
    });
    psbt.addOutput({ address: vault.address, value: 546n });
    psbt.addOutput({ script: runestone, value: 0n });
    psbt.addOutput({ address: admin.address, value: BigInt(input.value - 546 - 1_000) });

    const txid = await signAndBroadcast(psbt.toBase64(), [admin]);
    await mine(1, miner);

    expect(await ord(`/rune/${rune.name}`)).toBeUndefined();
    expect(await runeBalances(txid, 0)).toEqual({});
    console.log(`no-commit etch ${txid}: ord has no rune ${rune.name}`);
  });

  test("a reveal one block early is ignored; at 6 confirmations the rune exists", async () => {
    const early = receiptRune("SOLSTICETOOEARLY");
    const earlyCommit = await commit(early);
    const receiptCommit = await commit(RECEIPT);
    await mine(1, miner);
    const commitHeight = await heightOf(receiptCommit.txid);

    // Commit has 1 confirmation. Mine up to the block before the earliest valid one.
    await mine(ETCH_COMMIT_CONFIRMATIONS - 3, miner);
    const earlyTxid = await reveal(early, earlyCommit);
    await mine(1, miner);
    expect(await heightOf(earlyTxid)).toBe(commitHeight + ETCH_COMMIT_CONFIRMATIONS - 2);
    expect(await ord(`/rune/${early.name}`)).toBeUndefined();

    const etchTxid = await reveal(RECEIPT, receiptCommit);
    await mine(1, miner);
    const etchHeight = await heightOf(etchTxid);
    expect(etchHeight).toBe(commitHeight + ETCH_COMMIT_CONFIRMATIONS - 1);

    const indexed = await ord<OrdRune>(`/rune/${RECEIPT.name}`);
    expect(indexed).toBeDefined();
    expect(indexed!.entry).toMatchObject({
      block: etchHeight,
      divisibility: 8,
      etching: etchTxid,
      spaced_rune: RECEIPT_SPACED,
      symbol: "$",
      terms: null,
      turbo: true,
    });
    expect(BigInt(indexed!.entry.premine)).toBe(SUPPLY);

    const [block, tx] = indexed!.id.split(":").map(BigInt);
    expect(block).toBe(BigInt(etchHeight));
    receipt = { ...RECEIPT, id: { block, tx } };

    // The whole premine sits on output 0, the vault output.
    expect(await runeBalances(etchTxid, 0)).toEqual({ [RECEIPT_SPACED]: SUPPLY });
    vaultRt = { txid: etchTxid, vout: 0, value: 546, scriptPubKey: vault.scriptHex, runeAmount: SUPPLY };

    console.log(
      `commit ${receiptCommit.txid} (height ${commitHeight})\n` +
        `etch   ${etchTxid} (height ${etchHeight})\n` +
        `ord: rune ${indexed!.entry.spaced_rune}, id ${indexed!.id}, premine ${indexed!.entry.premine} on ${etchTxid}:0\n` +
        `early reveal ${earlyTxid}: ord has no rune ${early.name}`,
    );
  });

  test("invest: ord reports the balances the output plan predicts", async () => {
    const rtAmount = 150_000_000n; // 1.5 RT
    const plan = buildInvestTransaction({
      rune: receipt,
      vaultRtInputs: [vaultRt],
      rtAmount,
      investorRtAddress: investor.address,
      vaultRtChangeAddress: vault.address,
      investorBtcInputs: [await fresh(investor)],
      btcAmount: 150_000_000,
      ypDeploymentAddress: yieldProvider.address,
      investorBtcChangeAddress: investor.address,
      feeRate: FEE_RATE,
      network: NETWORK,
    });
    expect(plan.outputs.map((o) => o.role)).toEqual([
      "rt recipient",
      "rt change",
      "btc recipient",
      "runestone",
      "btc change",
    ]);

    const txid = await signAndBroadcast(plan.psbtBase64, [vault, investor]);
    await mine(1, miner);

    const balances = await balancesByRole(txid, plan);
    expect(balances).toEqual({
      "rt recipient": rtAmount,
      "rt change": plan.runeChange,
      "btc recipient": 0n,
      "btc change": 0n,
    });
    expect(plan.runeChange).toBe(SUPPLY - rtAmount);
    expect(await runeBalances(vaultRt.txid, vaultRt.vout)).toEqual({}); // spent

    investorRt = { txid, vout: 0, value: 546, scriptPubKey: investor.scriptHex, runeAmount: rtAmount };
    vaultRt = { txid, vout: 1, value: 546, scriptPubKey: vault.scriptHex, runeAmount: plan.runeChange };
    console.log(`invest ${txid}: investor ${balances["rt recipient"]}, vault ${balances["rt change"]}`);
  });

  test("withdraw (partial): ord reports the balances the output plan predicts", async () => {
    const rtAmount = 50_000_000n; // 0.5 RT back to the vault
    const plan = buildWithdrawTransaction({
      rune: receipt,
      userRtInputs: [investorRt],
      rtAmount,
      vaultRtAddress: vault.address,
      userRtChangeAddress: investor.address,
      bufferBtcInputs: [await fresh(buffer)],
      btcAmount: 50_500_000,
      userBtcAddress: investor.address,
      bufferBtcChangeAddress: buffer.address,
      feeRate: FEE_RATE,
      network: NETWORK,
    });

    const txid = await signAndBroadcast(plan.psbtBase64, [investor, buffer]);
    await mine(1, miner);

    const balances = await balancesByRole(txid, plan);
    expect(balances).toEqual({
      "rt recipient": rtAmount,
      "rt change": investorRt.runeAmount - rtAmount,
      "btc recipient": 0n,
      "btc change": 0n,
    });

    investorRt = { ...investorRt, txid, vout: 1, runeAmount: investorRt.runeAmount - rtAmount };
    console.log(`withdraw ${txid}: vault ${balances["rt recipient"]}, investor ${balances["rt change"]}`);
  });

  test("withdraw (everything, no rune change): the whole balance returns to the vault", async () => {
    const plan = buildWithdrawTransaction({
      rune: receipt,
      userRtInputs: [investorRt],
      rtAmount: investorRt.runeAmount,
      vaultRtAddress: vault.address,
      userRtChangeAddress: investor.address,
      bufferBtcInputs: [await fresh(buffer)],
      btcAmount: 101_000_000,
      userBtcAddress: investor.address,
      bufferBtcChangeAddress: buffer.address,
      feeRate: FEE_RATE,
      network: NETWORK,
    });
    expect(plan.outputs.map((o) => o.role)).toEqual([
      "rt recipient",
      "btc recipient",
      "runestone",
      "btc change",
    ]);

    const txid = await signAndBroadcast(plan.psbtBase64, [investor, buffer]);
    await mine(1, miner);

    expect(await balancesByRole(txid, plan)).toEqual({
      "rt recipient": investorRt.runeAmount,
      "btc recipient": 0n,
      "btc change": 0n,
    });

    // Nothing was minted or burned along the way.
    const indexed = await ord<{ entry: { burned: number | string; mints: number | string } }>(
      `/rune/${RECEIPT.name}`,
    );
    expect(BigInt(indexed!.entry.burned)).toBe(0n);
    expect(BigInt(indexed!.entry.mints)).toBe(0n);
    console.log(`withdraw-all ${txid}: vault ${investorRt.runeAmount}, burned ${indexed!.entry.burned}`);
  });
});
