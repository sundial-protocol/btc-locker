/**
 * The functions `btc-locker solstice etch` runs, without its prompts, on a live
 * chain: bitcoind regtest, indexed by ord with the runes index. Start the
 * daemons with `btc-regtest up --ord` (or run everything with `npm run regtest`).
 *
 * The CLI imports the built @sundial-protocol/btc-locker and
 * @sundial-protocol/solstice packages, so build them first.
 */

import { expect, test } from "vitest";
import { createBTCLocker } from "@sundial-protocol/btc-locker";
import { formatSpacedRune, type ReceiptRune } from "@sundial-protocol/solstice";
import { NETWORK, esploraOverRpc, party, rpc } from "@sundial-protocol/btc-regtest";
import { mine, ord, runeBalances } from "@sundial-protocol/btc-regtest/ord";
// @ts-expect-error the CLI is plain JavaScript with no type declarations
import * as cli from "../bin/commands/solstice.js";

const FEE_RATE = 2;
const SUPPLY = 2_100_000_000_000_000n;

function receiptRune(name: string, spacers?: number): ReceiptRune {
  return { name, displayTicker: "RT", divisibility: 8, symbol: 0x24, spacers, totalSupply: SUPPLY };
}

test("commit, refuse to etch early, etch: ord shows the full premine at the vault", async () => {
  const info = await ord<{ rune_index: boolean; chain: string }>("/status");
  expect(info?.chain).toBe("regtest");
  expect(info?.rune_index).toBe(true);

  const miner = party("cli regtest miner");
  const admin = party("cli regtest admin");
  const vault = party("cli regtest vault");
  await rpc("generatetoaddress", 2, admin.address);
  await mine(100, miner);

  // BitcoinAPI has no regtest endpoint, so the locker gets bitcoind's RPC
  // behind the same method names.
  const locker = await createBTCLocker("regtest", esploraOverRpc as never);
  const ctx = { api: esploraOverRpc, locker, network: NETWORK };
  const rune = receiptRune("SOLSTICECLIRUNE", 0b1000_0000);
  const fromKey = admin.privateKeyHex;
  const step2 = { rune, fromKey, vaultAddress: vault.address, feeRate: FEE_RATE };

  const commitPlan = await cli.buildEtchCommit(ctx, { rune, fromKey, feeRate: FEE_RATE });
  const commitTxid: string = await cli.signAndBroadcast(ctx, commitPlan.psbtBase64, fromKey);
  await mine(1, miner);

  await expect(cli.buildEtchReveal(ctx, { ...step2, commitTxid })).rejects.toThrow(
    /1 confirmation\(s\); wait for 5/,
  );
  await mine(4, miner);
  await expect(
    cli.buildEtchReveal(ctx, { ...step2, commitTxid, rune: receiptRune("SOLSTICEOTHERNAME") }),
  ).rejects.toThrow(/does not commit to SOLSTICEOTHERNAME/);

  const etchPlan = await cli.buildEtchReveal(ctx, { ...step2, commitTxid });
  const etchTxid: string = await cli.signAndBroadcast(ctx, etchPlan.psbtBase64, fromKey);
  await mine(1, miner);

  const indexed = await ord<{ id: string; entry: { etching: string; premine: number | string; spaced_rune: string } }>(
    `/rune/${rune.name}`,
  );
  expect(indexed?.entry.etching).toBe(etchTxid);
  expect(BigInt(indexed!.entry.premine)).toBe(SUPPLY);
  const vaultOutput = await ord<{ address: string }>(`/output/${etchTxid}:0`);
  expect(vaultOutput?.address).toBe(vault.address);
  expect(await runeBalances(etchTxid, 0)).toEqual({
    [formatSpacedRune(rune.name, rune.spacers)]: SUPPLY,
  });
  console.log(
    `CLI commit ${commitTxid}\nCLI etch   ${etchTxid}\n` +
      `ord: rune ${indexed!.entry.spaced_rune}, id ${indexed!.id}, premine ${indexed!.entry.premine} at ${vaultOutput!.address}`,
  );
});
