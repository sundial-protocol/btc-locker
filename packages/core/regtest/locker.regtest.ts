/**
 * The locker's scripts and transaction builders on a live chain: bitcoind
 * regtest, with the mempool policy mainnet nodes apply.
 *
 * Every transaction is built by this package's builders and signed by its
 * `signTransaction`. Every expectation is what bitcoind says about the signed
 * transaction: accepted, or rejected and why. Run with `npm run regtest`, or
 * start bitcoind with `btc-regtest up` and run `npm run test:regtest`.
 *
 * The tests run in order and share one chain.
 */

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import {
  NETWORK,
  broadcast,
  esploraOverRpc,
  medianTime,
  mempoolAccept,
  mine,
  party as partyFor,
  rpc,
  utxosOf,
  type Party,
} from "@sundial-protocol/btc-regtest";
import {
  BTCLocker,
  FeeUtils,
  NETWORKS,
  TxType,
  type BitcoinAPI,
  type ScriptInfo,
  type SundialMetadata,
  type UTXO,
} from "../src/index";

/** The rate every builder is told the chain asks for, in sat/vB. */
const FEE_RATE = 3;

/** Keys are derived from these labels, so transaction ids repeat from run to run. */
const party = (name: string) => partyFor(`dawn regtest ${name}`);

/** OP_IF and OP_NOTIF, as bytes that can also turn up inside a public key. */
const IF_BYTES = [bitcoin.opcodes.OP_IF, bitcoin.opcodes.OP_NOTIF];
const hasIfByte = (p: Party) => IF_BYTES.some((byte) => p.key.publicKey.includes(byte));

/** The first of `name 0`, `name 1`, ... whose public key does or does not hold such a byte. */
function partyWhere(name: string, wanted: boolean): Party {
  for (let i = 0; ; i++) {
    const candidate = party(`${name} ${i}`);
    if (hasIfByte(candidate) === wanted) return candidate;
  }
}

const miner = party("miner");
const user = partyWhere("user", false); // deposits; the escrow's after key
const provider = partyWhere("provider", false); // the escrow's before key; pays yield
const protocol = party("protocol fee");
const stranger = party("stranger");

/**
 * BitcoinAPI has no regtest endpoint, so the locker gets bitcoind's RPC behind
 * the same method names.
 */
const api = {
  ...esploraOverRpc,
  networkType: NETWORKS.regtest,
  provider: "mempool",
} as unknown as BitcoinAPI;

let locker: BTCLocker;

/** Next unspent coinbase of a party that the suite has not used yet. */
const used = new Set<string>();
async function fresh(owner: Party): Promise<UTXO> {
  const utxo = (await utxosOf(owner.address)).find(
    (u) => u.value >= 100_000 && !used.has(`${u.txid}:${u.vout}`),
  );
  if (!utxo) throw new Error(`no spendable output left for ${owner.name}`);
  used.add(`${utxo.txid}:${utxo.vout}`);
  return utxo;
}

const height = () => rpc<number>("getblockcount");

/** Mine until the tip is at `target`. */
async function mineTo(target: number): Promise<void> {
  const blocks = target - (await height());
  if (blocks > 0) await mine(blocks, miner);
}

function metadata(txType: TxType): SundialMetadata {
  return {
    magic: "SNDL",
    version: 1,
    txType,
    subjectId: "550e8400-e29b-41d4-a716-446655440000",
    providerXonlyPubkey: provider.xOnly.toString("hex"),
    flags: 0,
  };
}

/** What each accepted transaction paid, for the summary printed at the end. */
const feeRows: Array<Record<string, string | number>> = [];

/**
 * Check that bitcoind accepts a signed transaction and that it pays at least
 * `FEE_RATE` for its real size, then broadcast it. `estimate` is the
 * `FeeUtils.estimateFee` input and output count the builder used.
 */
async function accepted(
  flow: string,
  hex: string,
  estimate: { inputs: number; outputs: number },
): Promise<string> {
  const check = await mempoolAccept(hex);
  expect(check, `${flow}: ${check.reason}`).toMatchObject({ allowed: true });
  const estimated = FeeUtils.estimateFee(estimate.inputs, estimate.outputs, FEE_RATE);
  feeRows.push({
    flow,
    vsize: check.vsize!,
    "fee paid": check.fee!,
    "sat/vB": Number((check.fee! / check.vsize!).toFixed(2)),
    "estimated size": estimated / FEE_RATE,
  });
  expect(check.fee, `${flow}: fee paid`).toBeGreaterThanOrEqual(check.vsize! * FEE_RATE);
  expect(estimated, `${flow}: estimateFee`).toBeGreaterThanOrEqual(check.vsize! * FEE_RATE);
  return broadcast(hex);
}

/** Check that bitcoind rejects a signed transaction for the given reason. */
async function rejected(hex: string, reason: RegExp): Promise<void> {
  const check = await mempoolAccept(hex);
  expect(check.allowed, "bitcoind accepted a transaction it should reject").toBe(false);
  expect(check.reason).toMatch(reason);
}

const NON_FINAL = /^non-final$/;
const CLTV_FAILED = /Locktime requirement not satisfied/;
// The signature is well formed but made by the other key, so OP_CHECKSIG is false.
const BAD_SIGNATURE = /finished with a false\/empty top stack element|Signature must be zero for failed CHECK/;

/** Re-point a PSBT's locktime, to test the script and not only the builder. */
function withLocktime(psbtBase64: string, locktime: number): string {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: NETWORK });
  psbt.setLocktime(locktime);
  return psbt.toBase64();
}

/** One Dawn position: an escrow and a timelock funded by one deposit. */
interface Position {
  escrow: ScriptInfo;
  timelock: ScriptInfo;
  escrowUtxo: UTXO;
  timelockUtxo: UTXO;
}

const ESCROW_AMOUNT = 1_000_000;
const TIMELOCK_AMOUNT = 4_000_000;
const PROTOCOL_FEE = 10_000;

async function deposit(flow: string, deadline: number): Promise<Position> {
  const escrow = await locker.createEscrowScript(deadline, provider.publicKeyHex, user.publicKeyHex);
  const timelock = await locker.createTimelockScript(deadline, user.publicKeyHex);

  const psbt = await locker.createDepositTransactionWithScript({
    inputs: [await fresh(user)],
    sourceAddress: user.address,
    escrowAddress: escrow.address,
    escrowAmount: ESCROW_AMOUNT,
    timelockScript: timelock,
    timelockAmount: TIMELOCK_AMOUNT,
    changeAddress: user.address,
    feeAddress: protocol.address,
    protocolFeeAmount: PROTOCOL_FEE,
    metadata: metadata(TxType.Deposit),
  });
  const hex = await locker.signTransaction(psbt, user.privateKeyHex);
  // escrow, timelock, protocol fee, change, metadata
  const txid = await accepted(flow, hex, { inputs: 1, outputs: 5 });
  await mine(1, miner);

  const [escrowUtxo] = await utxosOf(escrow.address);
  const [timelockUtxo] = await utxosOf(timelock.address);
  expect(escrowUtxo).toMatchObject({ txid, vout: 0, value: ESCROW_AMOUNT });
  expect(timelockUtxo).toMatchObject({ txid, vout: 1, value: TIMELOCK_AMOUNT });
  expect(await utxosOf(protocol.address)).toContainEqual(
    expect.objectContaining({ txid, vout: 2, value: PROTOCOL_FEE }),
  );
  return { escrow, timelock, escrowUtxo, timelockUtxo };
}

/** A claim of a position's escrow output, on either branch. */
function claim(position: Position, to: Party, spendAfterDeadline: boolean): Promise<string> {
  return locker.createClaimTransaction({
    scriptData: position.escrow,
    utxoTxId: position.escrowUtxo.txid,
    utxoIndex: position.escrowUtxo.vout,
    amount: position.escrowUtxo.value,
    outputAddress: to.address,
    spendAfterDeadline,
    metadata: metadata(TxType.Claim),
  });
}

/** Pay to a script address from a party's coinbase, with the generic funding builder. */
async function fund(flow: string, from: Party, script: ScriptInfo, amount: number): Promise<UTXO> {
  const input = await fresh(from);
  const fee = FeeUtils.estimateFee(1, 2, FEE_RATE);
  const psbt = await locker.createFundingTransaction({
    inputs: [input],
    sourceAddress: from.address,
    outputs: [
      { address: script.address, value: amount },
      { address: from.address, value: input.value - amount - fee },
    ],
  });
  const txid = await accepted(flow, await locker.signTransaction(psbt, from.privateKeyHex), {
    inputs: 1,
    outputs: 2,
  });
  await mine(1, miner);
  return { txid, vout: 0, value: amount };
}

/** Spend script outputs to `to` with the generic spending builder, signed by `signer`. */
async function spend(script: ScriptInfo, inputs: UTXO[], to: Party, signer: Party): Promise<string> {
  const total = inputs.reduce((sum, u) => sum + u.value, 0);
  const psbt = await locker.createSpendingTransaction({
    inputs,
    outputs: [
      { address: to.address, value: total - FeeUtils.estimateFee(inputs.length, 1, FEE_RATE) },
    ],
    redeemScript: script.redeemScript,
  });
  return locker.signTransaction(psbt, signer.privateKeyHex);
}

beforeAll(async () => {
  const info = await rpc<{ chain: string }>("getblockchaininfo");
  expect(info.chain).toBe("regtest");

  // Every builder asks FeeUtils for the chain's rate. Regtest has no fee
  // market, and without this distribute and withdraw would ask mempool.space.
  vi.spyOn(FeeUtils, "queryChainFeeRates").mockResolvedValue(FEE_RATE);

  locker = new BTCLocker(NETWORKS.regtest, api);
  await locker.init();

  // Coinbases for everyone who pays for something, then 100 blocks to mature them.
  for (const p of [user, provider]) await rpc("generatetoaddress", 8, p.address);
  await mine(100, miner);
});

afterAll(async () => {
  vi.useRealTimers();
  await rpc("setmocktime", 0);
  console.table(feeRows);
});

describe("a Dawn position the provider claims", () => {
  let position: Position;
  let deadline: number;
  let yieldUtxo: UTXO;

  test("deposit: one transaction funds the escrow, the timelock and the protocol fee", async () => {
    deadline = (await height()) + 12;
    position = await deposit("deposit", deadline);
  });

  test("escrow, before branch: only the provider's signature spends it", async () => {
    const psbt = await claim(position, provider, false);

    // The user's key is in the script too, on the other branch.
    await rejected(await locker.signTransaction(psbt, user.privateKeyHex), BAD_SIGNATURE);
    // A key that is not in the script cannot produce a signature at all.
    await expect(locker.signTransaction(psbt, stranger.privateKeyHex)).rejects.toThrow(
      /Can not sign for this input/,
    );
    // The provider's signature on the after branch, before the deadline.
    const early = await locker.signTransaction(
      await claim(position, provider, true),
      provider.privateKeyHex,
      { spendAfterDeadline: true },
    );
    await rejected(early, NON_FINAL);

    const hex = await locker.signTransaction(psbt, provider.privateKeyHex);
    // The builder counts one input and one output; it also adds the metadata output.
    await accepted("claim (before branch)", hex, { inputs: 1, outputs: 1 });
    await mine(1, miner);
    expect(await utxosOf(position.escrow.address)).toEqual([]);
  });

  test("distribute: the provider pays yield to the user's timelock", async () => {
    const amount = 250_000;
    const psbt = await locker.createDistributionTransaction({
      inputs: [await fresh(provider)],
      sourceAddress: provider.address,
      timelockAddress: position.timelock.address,
      amount,
      changeAddress: provider.address,
      feeAddress: protocol.address,
      protocolFeeAmount: PROTOCOL_FEE,
      metadata: metadata(TxType.Distribution),
    });
    const hex = await locker.signTransaction(psbt, provider.privateKeyHex);
    // timelock, protocol fee, change, metadata
    const txid = await accepted("distribute", hex, { inputs: 1, outputs: 4 });
    await mine(1, miner);
    yieldUtxo = { txid, vout: 0, value: amount };
    expect(await utxosOf(position.timelock.address)).toHaveLength(2);
  });

  test("timelock: unspendable until the deadline height, by anyone but the user after it", async () => {
    const inputs = [position.timelockUtxo, yieldUtxo];
    expect(await height()).toBeLessThan(deadline - 1);

    // The builder compares a locktime with the clock, so a block height always
    // looks expired to it. Consensus is what holds the coins.
    const hex = await spend(position.timelock, inputs, user, user);
    await rejected(hex, NON_FINAL);

    // Claiming an earlier locktime does not help: the script checks it.
    const total = TIMELOCK_AMOUNT + yieldUtxo.value;
    const psbt = await locker.createSpendingTransaction({
      inputs,
      outputs: [{ address: user.address, value: total - FeeUtils.estimateFee(2, 1, FEE_RATE) }],
      redeemScript: position.timelock.redeemScript,
    });
    const lying = await locker.signTransaction(
      withLocktime(psbt, await height()),
      user.privateKeyHex,
    );
    await rejected(lying, CLTV_FAILED);

    // A transaction with locktime N can be mined in block N + 1 at the earliest.
    await mineTo(deadline - 1);
    await rejected(hex, NON_FINAL);
    await mineTo(deadline);

    await expect(spend(position.timelock, inputs, provider, provider)).rejects.toThrow(
      /Can not sign for this input/,
    );
    await accepted("timelock spend (2 inputs)", hex, { inputs: 2, outputs: 1 });
    await mine(1, miner);
    expect(await utxosOf(position.timelock.address)).toEqual([]);
  });
});

describe("a Dawn position nobody claims", () => {
  let position: Position;
  let deadline: number;

  test("deposit", async () => {
    deadline = (await height()) + 6;
    position = await deposit("deposit (second position)", deadline);
  });

  test("withdraw: rejected until the deadline, then the user takes escrow and timelock together", async () => {
    // Inputs are looked up through the API the locker was given.
    const psbt = await locker.createWithdrawalTransaction({
      escrowRedeemScript: position.escrow.redeemScript,
      timelockRedeemScript: position.timelock.redeemScript,
      destination: user.address,
      feeAddress: protocol.address,
      protocolFeeAmount: PROTOCOL_FEE,
      metadata: metadata(TxType.Withdrawal),
    });
    const hex = await locker.signTransaction(psbt, user.privateKeyHex, {
      spendAfterDeadline: true,
    });

    await mineTo(deadline - 1);
    await rejected(hex, NON_FINAL);
    await mineTo(deadline);

    // After the deadline each escrow branch still belongs to one key.
    const afterBranch = await claim(position, provider, true);
    await rejected(
      await locker.signTransaction(afterBranch, provider.privateKeyHex, { spendAfterDeadline: true }),
      BAD_SIGNATURE,
    );
    const beforeBranch = await claim(position, user, false);
    await rejected(await locker.signTransaction(beforeBranch, user.privateKeyHex), BAD_SIGNATURE);

    // The builder counts the destination and the protocol fee; it also adds metadata.
    await accepted("withdraw (escrow + timelock)", hex, { inputs: 2, outputs: 2 });
    await mine(1, miner);
    expect(await utxosOf(position.escrow.address)).toEqual([]);
    expect(await utxosOf(position.timelock.address)).toEqual([]);
  });

  test("escrow, after branch: the user's claim alone, once the deadline has passed", async () => {
    const later = (await height()) + 3;
    const second = await deposit("deposit (third position)", later);
    const psbt = await claim(second, user, true);
    const hex = await locker.signTransaction(psbt, user.privateKeyHex, { spendAfterDeadline: true });

    await rejected(hex, NON_FINAL);
    await mineTo(later);
    await accepted("claim (after branch)", hex, { inputs: 1, outputs: 1 });
    await mine(1, miner);
  });
});

describe("timelock scripts on their own", () => {
  test("a public key that contains the OP_IF byte does not change how the script is spent", async () => {
    // 0x63 is OP_IF and 0x64 is OP_NOTIF. About one compressed key in four
    // contains one of them.
    const owner = partyWhere("owner with an if byte", true);
    expect(hasIfByte(owner)).toBe(true);

    const script = await locker.createTimelockScript(await height(), owner.publicKeyHex);
    const utxo = await fund("fund a timelock", user, script, 500_000);

    await accepted("timelock spend (key with 0x63)", await spend(script, [utxo], owner, owner), {
      inputs: 1,
      outputs: 1,
    });
    await mine(1, miner);
  });

  test("relative timelock: spendable once the output is as old as the script says", async () => {
    const blocks = 5;
    const script = await locker.createRelativeTimelockScript(blocks, user.publicKeyHex);
    const utxo = await fund("fund a relative timelock", user, script, 500_000);
    const hex = await spend(script, [utxo], user, user);

    // `fund` mined the output: it has 1 confirmation. BIP 68 wants `blocks`.
    await mine(blocks - 2, miner);
    await rejected(hex, /^non-BIP68-final$/);
    await mine(1, miner);
    await accepted("relative timelock spend", hex, { inputs: 1, outputs: 1 });
    await mine(1, miner);
  });

  test("time-based deadline: consensus waits for median time past, not the clock", async () => {
    const deadline = (await medianTime()) + 3_600;
    const script = await locker.createTimelockScript(deadline, user.publicKeyHex);
    const utxo = await fund("fund a time-based timelock", user, script, 500_000);

    // The builder refuses while the clock is short of the deadline.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime((deadline - 1) * 1000);
    await expect(spend(script, [utxo], user, user)).rejects.toThrow(/Timelock has not expired yet/);

    // One second past the deadline the builder allows the spend...
    vi.setSystemTime((deadline + 1) * 1000);
    const hex = await spend(script, [utxo], user, user);
    // ...and so does the node's clock, with a block already mined after the
    // deadline. Consensus still says no: it compares the locktime with the
    // median of the last 11 block times.
    await rpc("setmocktime", deadline + 1);
    await mine(1, miner);
    const tip = await rpc<{ time: number }>("getblockheader", await rpc("getbestblockhash"));
    expect(tip.time).toBeGreaterThan(deadline);
    await rejected(hex, NON_FINAL);

    // Six of the last eleven blocks have to be past the deadline.
    await mine(4, miner);
    expect(await medianTime()).toBeLessThan(deadline);
    await rejected(hex, NON_FINAL);
    await mine(1, miner);
    expect(await medianTime()).toBeGreaterThan(deadline);
    await accepted("timelock spend (time-based)", hex, { inputs: 1, outputs: 1 });
    await mine(1, miner);
  });
});
