/**
 * Helpers for the regtest suite: Bitcoin Core RPC, ord's JSON API, deterministic
 * keys. Nothing here uses a Bitcoin Core wallet; funds are tracked with
 * `scantxoutset` and every transaction is signed in the test.
 *
 * Ports and credentials are the defaults of `regtest.sh`.
 */

import { createHash } from "node:crypto";
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory, type ECPairInterface } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import type { UTXO } from "@sundial-protocol/btc-locker";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

export const NETWORK = bitcoin.networks.regtest;

const RPC_URL = `http://127.0.0.1:${process.env.SOLSTICE_REGTEST_RPC_PORT ?? 18543}/`;
const ORD_URL = `http://127.0.0.1:${process.env.SOLSTICE_REGTEST_ORD_PORT ?? 18580}`;
const RPC_AUTH = "Basic " + Buffer.from("solstice:solstice").toString("base64");

/** Call a Bitcoin Core RPC method. */
export async function rpc<T = unknown>(method: string, ...params: unknown[]): Promise<T> {
  let response: Response;
  try {
    response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: RPC_AUTH },
      body: JSON.stringify({ jsonrpc: "1.0", id: method, method, params }),
    });
  } catch (cause) {
    throw new Error(
      `bitcoind is not reachable at ${RPC_URL}. Start it with regtest/regtest.sh up`,
      { cause },
    );
  }
  const body = (await response.json()) as { result: T; error: { message: string } | null };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/**
 * GET a page from ord as JSON, or `undefined` on 404. Integers too large for a
 * JavaScript number (rune amounts are u128) are returned as strings.
 */
export async function ord<T = unknown>(path: string): Promise<T | undefined> {
  const response = await fetch(ORD_URL + path, { headers: { accept: "application/json" } });
  if (response.status === 404) return undefined;
  const text = await response.text();
  if (!response.ok) throw new Error(`ord ${path}: ${response.status} ${text}`);
  return JSON.parse(text.replace(/([:[,]\s*)(\d{16,})(?=\s*[,}\]])/g, '$1"$2"')) as T;
}

/** Wait until ord has indexed up to bitcoind's tip. */
export async function ordSynced(): Promise<number> {
  const height = await rpc<number>("getblockcount");
  for (let i = 0; i < 300; i++) {
    const response = await fetch(ORD_URL + "/blockheight");
    if (response.ok && Number(await response.text()) >= height) return height;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`ord did not reach height ${height}`);
}

export interface Party {
  name: string;
  key: ECPairInterface;
  /** P2WPKH address. */
  address: string;
  /** P2WPKH scriptPubKey, hex. */
  scriptHex: string;
  /** x-only public key, for taproot. */
  xOnly: Buffer;
}

/** A party with a key derived from its name, so runs are reproducible. */
export function party(name: string): Party {
  const key = ECPair.fromPrivateKey(
    createHash("sha256").update(`solstice regtest ${name}`).digest(),
    { network: NETWORK },
  );
  const payment = bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: NETWORK });
  return {
    name,
    key,
    address: payment.address!,
    scriptHex: Buffer.from(payment.output!).toString("hex"),
    xOnly: Buffer.from(key.publicKey.subarray(1, 33)),
  };
}

/** Mine `blocks` blocks, paying the coinbase to `to`. Returns the new height. */
export async function mine(blocks: number, to: Party): Promise<number> {
  await rpc("generatetoaddress", blocks, to.address);
  return ordSynced();
}

/** Unspent outputs of an address, oldest first. */
export async function utxosOf(address: string): Promise<UTXO[]> {
  const scan = await rpc<{
    unspents: Array<{ txid: string; vout: number; amount: number; scriptPubKey: string; height: number }>;
  }>("scantxoutset", "start", [`addr(${address})`]);
  return scan.unspents
    .sort((a, b) => a.height - b.height || a.txid.localeCompare(b.txid) || a.vout - b.vout)
    .map((u) => ({
      txid: u.txid,
      vout: u.vout,
      value: Math.round(u.amount * 1e8),
      scriptPubKey: u.scriptPubKey,
    }));
}

/**
 * Sign every input with whichever of `signers` owns it, finalize, broadcast.
 * Returns the txid.
 */
export async function signAndBroadcast(psbtBase64: string, signers: Party[]): Promise<string> {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: NETWORK });
  psbt.data.inputs.forEach((input, index) => {
    const script = Buffer.from(input.witnessUtxo!.script).toString("hex");
    const signer = input.tapLeafScript
      ? signers.find((s) =>
          Buffer.from(input.tapLeafScript![0].script).includes(s.xOnly),
        )
      : signers.find((s) => s.scriptHex === script);
    if (!signer) throw new Error(`no signer for input ${index}`);
    psbt.signInput(index, signer.key);
  });
  psbt.finalizeAllInputs();
  return rpc<string>("sendrawtransaction", psbt.extractTransaction().toHex());
}

/** Rune balances ord reports for one output: spaced rune name → amount. */
export async function runeBalances(txid: string, vout: number): Promise<Record<string, bigint>> {
  const output = await ord<{ runes?: Record<string, { amount: number | string }> }>(
    `/output/${txid}:${vout}`,
  );
  if (!output) throw new Error(`ord does not know output ${txid}:${vout}`);
  return Object.fromEntries(
    Object.entries(output.runes ?? {}).map(([name, pile]) => [name, BigInt(pile.amount)]),
  );
}
