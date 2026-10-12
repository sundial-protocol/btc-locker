/**
 * ord (the Runes reference indexer) helpers. Opt-in: start the daemons with
 * `btc-regtest up --ord`. Suites that do not use Runes never import this file.
 */

import { rpc } from "./index.js";

export const ORD_URL = `http://127.0.0.1:${process.env.BTC_REGTEST_ORD_PORT ?? 18580}`;

/**
 * GET a page from ord as JSON, or `undefined` on 404. Integers too large for a
 * JavaScript number (rune amounts are u128) are returned as strings.
 */
export async function ord<T = unknown>(path: string): Promise<T | undefined> {
  let response: Response;
  try {
    response = await fetch(ORD_URL + path, { headers: { accept: "application/json" } });
  } catch (cause) {
    throw new Error(`ord is not reachable at ${ORD_URL}. Start it with: btc-regtest up --ord`, {
      cause,
    });
  }
  if (response.status === 404) return undefined;
  const text = await response.text();
  if (!response.ok) throw new Error(`ord ${path}: ${response.status} ${text}`);
  return JSON.parse(text.replace(/([:[,]\s*)(\d{16,})(?=\s*[,}\]])/g, '$1"$2"')) as T;
}

/** Wait until ord has indexed up to bitcoind's tip. Returns the height. */
export async function ordSynced(): Promise<number> {
  const height = await rpc<number>("getblockcount");
  for (let i = 0; i < 300; i++) {
    const response = await fetch(ORD_URL + "/blockheight");
    if (response.ok && Number(await response.text()) >= height) return height;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`ord did not reach height ${height}`);
}

/** Mine `blocks` blocks to `to`, then wait for ord to index them. */
export async function mine(blocks: number, to: { address: string }): Promise<number> {
  await rpc("generatetoaddress", blocks, to.address);
  return ordSynced();
}

/** Rune balances ord reports for one output: spaced rune name to amount. */
export async function runeBalances(txid: string, vout: number): Promise<Record<string, bigint>> {
  const output = await ord<{ runes?: Record<string, { amount: number | string }> }>(
    `/output/${txid}:${vout}`,
  );
  if (!output) throw new Error(`ord does not know output ${txid}:${vout}`);
  return Object.fromEntries(
    Object.entries(output.runes ?? {}).map(([name, pile]) => [name, BigInt(pile.amount)]),
  );
}
