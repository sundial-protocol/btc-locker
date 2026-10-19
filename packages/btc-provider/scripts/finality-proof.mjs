#!/usr/bin/env node
/**
 * Fetch a finality proof for a confirmed transaction from the live APIs, once
 * from each provider, and check the two agree. Not run in CI: it needs the
 * network. Build the package first.
 *
 *   node scripts/finality-proof.mjs <txid> <network> <headers | target bits>
 *
 * `network` is bitcoin, testnet or testnet4. The last argument says how many
 * headers: a decimal number is an exact count, and a hex value with `0x` is
 * the compact target bits whose work the headers must reach. For Charms, pass
 * its FINALITY_TARGET_BITS from charms-client's bitcoin_tx.rs (0x16507000 on
 * 2026-10-14); only mainnet reaches it. Prints the proof as JSON.
 * Exits 1 if the providers disagree or a provider fails.
 */

import { BitcoinAPI } from "../dist/esm/index.js";

const [txid, network, size] = process.argv.slice(2);
if (!txid || !network || !size) {
  console.error("usage: node scripts/finality-proof.mjs <txid> <network> <headers | 0x target bits>");
  process.exit(2);
}
const options = size.startsWith("0x") ? { targetBits: Number(size) } : Number(size);

const providers = new BitcoinAPI(network).providers;
const proofs = [];
for (const provider of providers) {
  const api = new BitcoinAPI(network, provider);
  const started = Date.now();
  const proof = await api.getFinalityProof(txid, options);
  console.error(
    `${provider}: tx ${proof.tx.length / 2} bytes, proof ${proof.proof.length / 2} bytes, ` +
      `${proof.headers.length} headers, ${await api.getConfirmations(txid)} confirmations, ` +
      `${Date.now() - started} ms`,
  );
  proofs.push(JSON.stringify(proof));
}

if (new Set(proofs).size !== 1) {
  console.error("The providers returned different proofs.");
  process.exit(1);
}
if (providers.length > 1) console.error(`${providers.join(" and ")} agree.`);
console.log(JSON.stringify(JSON.parse(proofs[0]), null, 2));
