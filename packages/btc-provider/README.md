# @sundial-protocol/btc-provider

Bitcoin chain data and broadcast over Esplora HTTP APIs: mempool.space and
Blockstream by default, or your own server. It runs on Node 18 or later and in
the browser, and its only dependencies are `bitcoinjs-lib` and `varuint-bitcoin`.

It reads the chain (UTXOs, transactions, fees, the tip, confirmations) and
builds finality proofs: a transaction, the merkle proof that its block includes
it, and the headers mined after that block. It does not build or sign
transactions. `@sundial-protocol/btc-locker` uses it and re-exports
`BitcoinAPI`; `@sundial-protocol/solstice` uses it for chain access.

## Install

The package is published to GitHub Packages, which asks for a token even for
public packages. See [Installation](../../README.md#installation) in the
repository README for the `.npmrc` setup, then:

```sh
npm install @sundial-protocol/btc-provider
```

## Usage

```ts
import { BitcoinAPI, FeePriorities } from "@sundial-protocol/btc-provider";

// mempool.space first, then Blockstream if mempool.space fails.
const api = new BitcoinAPI("testnet4");

const utxos = await api.getAddressUtxos("tb1q...");
const feeRate = await api.queryChainFeeRates(FeePriorities.HIGH);
const { txid } = await api.broadcastTransaction(signedTxHex);
const confirmations = await api.getConfirmations(txid);
```

The network is `"bitcoin"`, `"testnet"` (testnet3), `"testnet4"` or
`"regtest"`, or any object with one of those as its `name`, such as an entry of
`NETWORKS`. Blockstream does not serve testnet4, so on testnet4 only
mempool.space is asked. Regtest needs a `baseUrl` (below).

## Providers and fallback

The second argument names the providers to ask, in order: `"mempool"`,
`"blockstream"`, or a list of both. The default is mempool.space, then
Blockstream. Naming one provider means no fallback.

Every method asks the first provider and moves to the next only when the
failure is the provider's: no answer, a timeout, a 429, a 5xx, or an answer
that does not parse. Any other 4xx is an answer about the request, which a
second provider would repeat, so it is thrown at once. When every provider
fails, the error lists each attempt.

Broadcasting a transaction a provider already has is not an error: the call
returns the txid, computed from the transaction itself.

## Options

The third argument:

| Option | Default | What it does |
| --- | --- | --- |
| `baseUrl` | none | Send every request to your own Esplora-compatible server (below). |
| `fetch` | global `fetch` | The `fetch` to call, for tests or a custom agent. |
| `timeoutMs` | `30000` | Abandon a request after this many milliseconds. |
| `onFallback(provider, error)` | none | Called when a provider fails and the next is about to be asked. |
| `userAgent` | `btc-provider/<version> (+<repo URL>)` | The User-Agent sent outside a browser. `null` sends none. |
| `fallbackFeeRates` | none | Rates by priority for `queryChainFeeRates` to return when no provider answers. Without them it throws. |

### Your own server

`baseUrl` points the class at a self-hosted mempool or Esplora instance, with
the path its API is served under and nothing for the network:

```ts
const api = new BitcoinAPI("regtest", undefined, {
  baseUrl: "http://localhost:3002",
});
```

Every request goes to that server. The public providers are not asked, the
second argument is ignored, and there is no fallback. It is the only way to use
regtest, and it works on any network. Errors and `onFallback` name the server
`"custom"`.

## Methods

| Method | Returns |
| --- | --- |
| `getAddressInfo(address)` | Funded and spent totals, on chain and in the mempool. |
| `getAddressUtxos(address)` | Every UTXO of the address, with its confirmation status. |
| `fetchConfirmedUtxos(address)` | Only the confirmed ones. |
| `getTransaction(txid)` | The raw transaction, hex. |
| `broadcastTransaction(txHex)` | `{ txid }`. |
| `getFeeEstimates()` | Fee rates in sat/vB by confirmation target, in blocks. |
| `queryChainFeeRates(priority)` | One fee rate in sat/vB for a `FeePriorities` value. |
| `getBlockHeight()` | The tip's height. |
| `getChainTip()` | The tip's height, hash and median time past, from one provider. |
| `getTransactionStatus(txid)` | `{ confirmed, block_height?, block_hash? }`. |
| `getConfirmations(txid)` | A count; 0 when unconfirmed. |
| `getMerkleBlockProof(txid)` | The BIP 37 merkle block for the transaction, hex. |
| `getBlockHash(height)` | The hash of the block at that height. |
| `getBlockHeader(hash)` | The 80-byte header, hex. |
| `getFinalityProof(txid, size)` | A `FinalityProof` (below). |

`makeRequest`, `makeRequestText` and `makeBroadcastRequest` send a path of your
choosing to the first provider only, with no fallback.

## Finality proofs

`getFinalityProof(txid, size)` returns `{ tx, proof, headers }`: the raw
transaction, the merkle block proving its block includes it, and the headers of
the blocks after that block, oldest first. The caller says how many headers its
verifier needs, since this package knows no verifier's rule:

```ts
// Exactly six headers after the transaction's block.
await api.getFinalityProof(txid, 6);

// As many headers as it takes for the transaction's block and the ones after
// it to hold the work of this compact target (fails after maxHeaders, default 36).
await api.getFinalityProof(txid, { targetBits: verifierTargetBits });
```

Before returning, it checks that the pieces fit together: the transaction hashes
to the txid, the merkle block names only that transaction and its tree reaches
the header's merkle root, each header meets its own stated target, hashes to
the block asked for and builds on the one before. A mismatch, which can happen
when a reorg lands between requests, throws an error that says to try again.

The helpers it uses are exported for verifying a proof yourself:
`merkleBlockTransactions`, `merkleBlockNames`, `blockHashOfHeader`,
`previousBlockHashOfHeader`, `headerMeetsItsTarget`, `targetOfBits`,
`workOfBits`, `workOfHeader` and `transactionId`.

`scripts/finality-proof.mjs` fetches a proof from the live providers, for
checking by hand:

```sh
node scripts/finality-proof.mjs <txid> <network> <headers | 0x target bits>
```

## Errors

Provider failures throw `BitcoinAPIError`, which carries the `provider` that
answered last, the HTTP `status` and response `body` when there was a response,
and `attempts`, one error per provider asked.
