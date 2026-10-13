#!/usr/bin/env node
/**
 * Fetch a finality proof for a confirmed transaction from the live APIs, once
 * from each provider, and check the two agree. Not run in CI: it needs the
 * network. Build the package first.
 *
 *   node scripts/finality-proof.mjs <txid> [network] [headers]
 *
 * `network` is bitcoin (default), testnet or testnet4. `headers` is an exact
 * count; without it, headers are added until the work Charms requires is
 * reached, which only mainnet can do. Prints the proof as JSON.
 * Exits 1 if the providers disagree or a provider fails.
 */

import { BitcoinAPI } from "../dist/esm/index.js";

const [txid, network = "bitcoin", headers] = process.argv.slice(2);
if (!txid) {
  console.error("usage: node scripts/finality-proof.mjs <txid> [network] [headers]");
  process.exit(2);
}

const providers = new BitcoinAPI(network).providers;
const proofs = [];
for (const provider of providers) {
  const api = new BitcoinAPI(network, provider);
  const started = Date.now();
  const proof = await api.getFinalityProof(txid, headers === undefined ? {} : Number(headers));
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
