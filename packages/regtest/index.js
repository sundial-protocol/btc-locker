/**
 * Helpers for regtest suites: Bitcoin Core RPC, mining, deterministic keys,
 * sign-and-broadcast. Nothing here uses a Bitcoin Core wallet; funds are tracked
 * with `scantxoutset` and every transaction is signed in the test.
 *
 * Ports and credentials are the defaults of `regtest.sh`. This file imports no
 * Sundial package, and nothing about ord or Runes: those helpers are in ./ord.js.
 */

import { createHash } from "node:crypto";
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

export const NETWORK = bitcoin.networks.regtest;

export const RPC_URL = `http://127.0.0.1:${process.env.BTC_REGTEST_RPC_PORT ?? 18543}/`;
const RPC_AUTH = "Basic " + Buffer.from("regtest:regtest").toString("base64");

/** Call a Bitcoin Core RPC method. */
export async function rpc(method, ...params) {
  let response;
  try {
    response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: RPC_AUTH },
      body: JSON.stringify({ jsonrpc: "1.0", id: method, method, params }),
    });
  } catch (cause) {
    throw new Error(`bitcoind is not reachable at ${RPC_URL}. Start it with: btc-regtest up`, {
      cause,
    });
  }
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/**
 * A party with a key derived from its label, so runs are reproducible. Use a
 * label that names the suite ("dawn regtest user"): two suites that share a
 * label share a key.
 */
export function party(label) {
  const key = ECPair.fromPrivateKey(createHash("sha256").update(label).digest(), {
    network: NETWORK,
  });
  const payment = bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: NETWORK });
  return {
    name: label,
    key,
    privateKeyHex: Buffer.from(key.privateKey).toString("hex"),
    publicKeyHex: Buffer.from(key.publicKey).toString("hex"),
    address: payment.address,
    scriptHex: Buffer.from(payment.output).toString("hex"),
    xOnly: Buffer.from(key.publicKey.subarray(1, 33)),
  };
}

/** Mine `blocks` blocks, paying the coinbase to `to`. Returns the new height. */
export async function mine(blocks, to) {
  await rpc("generatetoaddress", blocks, to.address);
  return rpc("getblockcount");
}

/** Unspent outputs of an address, oldest first. Confirmed outputs only. */
export async function utxosOf(address) {
  const scan = await rpc("scantxoutset", "start", [`addr(${address})`]);
  return scan.unspents
    .sort((a, b) => a.height - b.height || a.txid.localeCompare(b.txid) || a.vout - b.vout)
    .map((u) => ({
      txid: u.txid,
      vout: u.vout,
      value: Math.round(u.amount * 1e8),
      scriptPubKey: u.scriptPubKey,
    }));
}

/** Height of the block that confirmed `txid`. */
export async function heightOf(txid) {
  const tx = await rpc("getrawtransaction", txid, true);
  if (!tx.blockhash) throw new Error(`${txid} is not confirmed`);
  return (await rpc("getblockheader", tx.blockhash)).height;
}

/** Median time past of the tip: what consensus compares a time-based locktime with. */
export async function medianTime() {
  return (await rpc("getblockchaininfo")).mediantime;
}

/**
 * Whether bitcoind would take a signed transaction into its mempool, without
 * broadcasting it. `reason` is bitcoind's reject reason, `vsize` and `fee` (in
 * satoshis) are set when it is accepted.
 */
export async function mempoolAccept(hex) {
  const [result] = await rpc("testmempoolaccept", [hex]);
  return {
    allowed: result.allowed,
    reason: result["reject-reason"],
    vsize: result.vsize,
    fee: result.fees ? Math.round(result.fees.base * 1e8) : undefined,
  };
}

/** Broadcast a signed transaction. Returns the txid; throws with bitcoind's reason. */
export function broadcast(hex) {
  return rpc("sendrawtransaction", hex);
}

/**
 * Sign every input with whichever of `signers` owns it, finalize, broadcast.
 * Handles P2WPKH inputs and taproot script-path inputs whose leaf names the
 * signer's x-only key. Returns the txid.
 */
export async function signAndBroadcast(psbtBase64, signers) {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: NETWORK });
  psbt.data.inputs.forEach((input, index) => {
    const script = Buffer.from(input.witnessUtxo.script).toString("hex");
    const signer = input.tapLeafScript
      ? signers.find((s) => Buffer.from(input.tapLeafScript[0].script).includes(s.xOnly))
      : signers.find((s) => s.scriptHex === script);
    if (!signer) throw new Error(`no signer for input ${index}`);
    psbt.signInput(index, signer.key);
  });
  psbt.finalizeAllInputs();
  return broadcast(psbt.extractTransaction().toHex());
}

/**
 * The Esplora-style calls Sundial code makes on a chain API (`getAddressUtxos`,
 * `fetchConfirmedUtxos`, `getTransaction`, `getBlockHeight`,
 * `broadcastTransaction`, `makeRequest("/tx/:txid/status")`), served from
 * bitcoind. Hand it to code that expects such an object.
 */
export const esploraOverRpc = {
  async getAddressUtxos(address) {
    const height = await rpc("getblockcount");
    return (await utxosOf(address)).map((u) => ({
      ...u,
      status: { confirmed: true, block_height: height },
    }));
  },
  fetchConfirmedUtxos: (address) => esploraOverRpc.getAddressUtxos(address),
  getTransaction: (txid) => rpc("getrawtransaction", txid),
  getBlockHeight: () => rpc("getblockcount"),
  async broadcastTransaction(hex) {
    return { txid: await broadcast(hex) };
  },
  async makeRequest(endpoint) {
    const match = /^\/tx\/([0-9a-f]{64})\/status$/.exec(endpoint);
    if (!match) throw new Error(`esploraOverRpc: unsupported endpoint ${endpoint}`);
    const tx = await rpc("getrawtransaction", match[1], true);
    if (!tx.blockhash) return { confirmed: false };
    const header = await rpc("getblockheader", tx.blockhash);
    return { confirmed: true, block_height: header.height };
  },
};
