import { describe, test, expect, vi } from "vitest";
import BitcoinAPI, { BitcoinAPIError } from "../src/bitcoin-api";
import type { ApiProvider } from "../src/bitcoin-api";
import { NETWORKS } from "../src/network";
import { SEGWIT_TX } from "./fixtures";

type Answer = Response | Error | (() => Response | Error);

const ok = (body: string) => () => new Response(body);
const status =
  (code: number, body = "") =>
  () =>
    new Response(body, { status: code });

/**
 * A fake fetch that answers by host, and records the hosts asked in order.
 */
function hosts(answers: { [host: string]: Answer }) {
  const asked: string[] = [];
  const fetchFn = vi.fn(async (url: string) => {
    const host = new URL(url).host;
    asked.push(host);
    const answer = answers[host];
    if (!answer) throw new Error(`unexpected request to ${host}`);
    const result = typeof answer === "function" ? answer() : answer;
    if (result instanceof Error) throw result;
    return result;
  });
  return { asked, fetch: fetchFn as unknown as typeof fetch, fetchFn };
}

const MEMPOOL = "mempool.space";
const BLOCKSTREAM = "blockstream.info";
const BLOCKCYPHER = "api.blockcypher.com";

describe("providers", () => {
  test("default to mempool.space, then Blockstream", () => {
    const api = new BitcoinAPI("testnet");
    expect(api.providers).toEqual(["mempool", "blockstream"]);
    expect(api.provider).toBe("mempool");
  });

  test("default to mempool.space alone on testnet4", () => {
    expect(new BitcoinAPI("testnet4").providers).toEqual(["mempool"]);
  });

  test("one named provider is the only one asked", async () => {
    const { asked, fetch } = hosts({ [MEMPOOL]: status(503) });
    const api = new BitcoinAPI("testnet", "mempool", { fetch });
    expect(api.providers).toEqual(["mempool"]);
    await expect(api.getBlockHeight()).rejects.toThrow(
      "Failed to get block height: API Error 503"
    );
    expect(asked).toEqual([MEMPOOL]);
  });

  test("a list keeps its order and drops repeats", () => {
    const api = new BitcoinAPI("bitcoin", [
      "blockcypher",
      "mempool",
      "blockcypher",
    ]);
    expect(api.providers).toEqual(["blockcypher", "mempool"]);
    expect(api.provider).toBe("blockcypher");
  });

  test("a list leaves out providers that do not serve the network", () => {
    const api = new BitcoinAPI("testnet4", ["blockstream", "mempool"]);
    expect(api.providers).toEqual(["mempool"]);
  });

  test("a list with no provider for the network throws", () => {
    expect(
      () => new BitcoinAPI("testnet4", ["blockstream", "blockcypher"])
    ).toThrow(
      "None of the API providers (blockstream, blockcypher) serves the 'testnet4' network."
    );
  });
});

describe("fallback, by method", () => {
  const utxos = JSON.stringify([
    { txid: "a".repeat(64), vout: 0, value: 1, status: { confirmed: true } },
  ]);
  const cases: Array<
    [string, (api: BitcoinAPI) => Promise<unknown>, string, unknown]
  > = [
    [
      "getAddressInfo",
      (api) => api.getAddressInfo("tb1q"),
      '{"address":"tb1q"}',
      { address: "tb1q" },
    ],
    [
      "getAddressUtxos",
      (api) => api.getAddressUtxos("tb1q"),
      utxos,
      JSON.parse(utxos),
    ],
    [
      "fetchConfirmedUtxos",
      (api) => api.fetchConfirmedUtxos("tb1q"),
      utxos,
      JSON.parse(utxos),
    ],
    ["getTransaction", (api) => api.getTransaction("ab"), "0100", "0100"],
    [
      "broadcastTransaction",
      (api) => api.broadcastTransaction("0100"),
      "txid1",
      { txid: "txid1" },
    ],
    ["getFeeEstimates", (api) => api.getFeeEstimates(), '{"1":9}', { 1: 9 }],
    ["getBlockHeight", (api) => api.getBlockHeight(), "77", 77],
  ];

  test.each(cases)(
    "%s asks the next provider when the first is down",
    async (_name, ask, body, expected) => {
      const { asked, fetch } = hosts({
        [MEMPOOL]: status(502, "Bad Gateway"),
        [BLOCKSTREAM]: ok(body),
      });
      const api = new BitcoinAPI("testnet", undefined, { fetch });
      expect(await ask(api)).toEqual(expected);
      expect(asked).toEqual([MEMPOOL, BLOCKSTREAM]);
    }
  );

  test("the next provider is asked in its own dialect", async () => {
    const { fetchFn, fetch } = hosts({
      [BLOCKSTREAM]: new TypeError("fetch failed"),
      [BLOCKCYPHER]: ok('{"height":42}'),
    });
    const api = new BitcoinAPI("bitcoin", ["blockstream", "blockcypher"], {
      fetch,
    });
    expect(await api.getBlockHeight()).toBe(42);
    expect(fetchFn.mock.calls[1][0]).toBe(
      "https://api.blockcypher.com/v1/btc/main/"
    );
  });

  test("three providers are tried in order", async () => {
    const { asked, fetch } = hosts({
      [BLOCKCYPHER]: status(429),
      [MEMPOOL]: status(500),
      [BLOCKSTREAM]: ok("5"),
    });
    const api = new BitcoinAPI(
      "bitcoin",
      ["blockcypher", "mempool", "blockstream"],
      { fetch }
    );
    expect(await api.getBlockHeight()).toBe(5);
    expect(asked).toEqual([BLOCKCYPHER, MEMPOOL, BLOCKSTREAM]);
  });

  test("makeRequest, makeRequestText and makeBroadcastRequest ask the first provider only", async () => {
    const { asked, fetch } = hosts({ [MEMPOOL]: status(500, "down") });
    const api = new BitcoinAPI("testnet", undefined, { fetch });
    await expect(api.makeRequest("/x")).rejects.toThrow("API Error 500: down");
    await expect(api.makeRequestText("/x")).rejects.toThrow("API Error 500");
    await expect(api.makeBroadcastRequest("/tx", "00")).rejects.toThrow(
      "API Error 500"
    );
    expect(asked).toEqual([MEMPOOL, MEMPOOL, MEMPOOL]);
  });
});

describe("fallback, by failure", () => {
  const next: Array<[string, Answer]> = [
    ["a network error", new TypeError("fetch failed")],
    ["HTTP 429", status(429, "Too Many Requests")],
    ["HTTP 500", status(500)],
    ["HTTP 503", status(503)],
    ["'invalid network'", status(400, "invalid network")],
    ["an answer that does not parse", ok("<!DOCTYPE html>")],
  ];
  test.each(next)("%s moves on to the next provider", async (_name, answer) => {
    const { asked, fetch } = hosts({
      [MEMPOOL]: answer,
      [BLOCKSTREAM]: ok("9"),
    });
    const api = new BitcoinAPI("testnet", undefined, { fetch });
    expect(await api.getBlockHeight()).toBe(9);
    expect(asked).toEqual([MEMPOOL, BLOCKSTREAM]);
  });

  test("a timeout moves on to the next provider", async () => {
    const asked: string[] = [];
    const fetchFn = (url: string, init: RequestInit) => {
      const host = new URL(url).host;
      asked.push(host);
      if (host === BLOCKSTREAM) return Promise.resolve(new Response("9"));
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener("abort", () =>
          reject(init.signal!.reason)
        );
      });
    };
    const api = new BitcoinAPI("testnet", undefined, {
      fetch: fetchFn as unknown as typeof fetch,
      timeoutMs: 20,
    });
    expect(await api.getBlockHeight()).toBe(9);
    expect(asked).toEqual([MEMPOOL, BLOCKSTREAM]);
  });

  const stay: Array<[string, Answer]> = [
    ["HTTP 400", status(400, "bad request")],
    ["HTTP 404", status(404, "Transaction not found")],
  ];
  test.each(stay)(
    "%s is the answer: no second provider",
    async (_n, answer) => {
      const { asked, fetch } = hosts({
        [MEMPOOL]: answer,
        [BLOCKSTREAM]: ok("0100"),
      });
      const api = new BitcoinAPI("testnet", undefined, { fetch });
      await expect(api.getTransaction("ab")).rejects.toThrow(
        "Failed to get transaction: API Error 4"
      );
      expect(asked).toEqual([MEMPOOL]);
    }
  );

  test("a rejected broadcast is not offered to a second provider", async () => {
    const { asked, fetch } = hosts({
      [MEMPOOL]: status(
        400,
        'sendrawtransaction RPC error: {"code":-26,"message":"min relay fee not met"}'
      ),
      [BLOCKSTREAM]: ok("txid"),
    });
    const api = new BitcoinAPI("testnet", undefined, { fetch });
    await expect(api.broadcastTransaction(SEGWIT_TX.hex)).rejects.toThrow(
      "Failed to broadcast transaction: API Error 400"
    );
    expect(asked).toEqual([MEMPOOL]);
  });

  test("UTXO lookup follows the same rules as every other call", async () => {
    const bad = hosts({ [MEMPOOL]: status(400, "bad address") });
    await expect(
      new BitcoinAPI("testnet", undefined, {
        fetch: bad.fetch,
      }).getAddressUtxos("tb1q")
    ).rejects.toThrow("Failed to get UTXOs: API Error 400: bad address");
    expect(bad.asked).toEqual([MEMPOOL]);

    // mempool.space named alone has nothing behind it.
    const wrong = hosts({ [MEMPOOL]: status(400, "invalid network") });
    await expect(
      new BitcoinAPI("testnet", "mempool", {
        fetch: wrong.fetch,
      }).getAddressUtxos("tb1q")
    ).rejects.toThrow("Failed to get UTXOs: API Error 400: invalid network");
    expect(wrong.asked).toEqual([MEMPOOL]);
  });
});

describe("when every provider fails", () => {
  test("the error names each provider and carries the last answer", async () => {
    const { fetch } = hosts({
      [MEMPOOL]: new TypeError("fetch failed", {
        cause: new Error("ECONNREFUSED"),
      }),
      [BLOCKSTREAM]: status(503, "maintenance"),
    });
    const api = new BitcoinAPI("testnet", undefined, { fetch });
    const error = await api.getBlockHeight().catch((e) => e);

    expect(error).toBeInstanceOf(BitcoinAPIError);
    expect(error.message).toBe(
      "Failed to get block height (tried multiple APIs): " +
        "mempool: fetch failed: ECONNREFUSED; blockstream: API Error 503: maintenance"
    );
    expect(error.provider).toBe("blockstream");
    expect(error.status).toBe(503);
    expect(error.body).toBe("maintenance");
    expect(error.attempts.map((a: BitcoinAPIError) => a.provider)).toEqual([
      "mempool",
      "blockstream",
    ]);
    expect(error.attempts[0].status).toBeUndefined();
  });

  test("a single failure keeps the short message and its status", async () => {
    const { fetch } = hosts({ [BLOCKSTREAM]: status(404, "not found") });
    const api = new BitcoinAPI("testnet", "blockstream", { fetch });
    const error = await api.getTransaction("ab").catch((e) => e);
    expect(error.message).toBe(
      "Failed to get transaction: API Error 404: not found"
    );
    expect(error.status).toBe(404);
    expect(error.attempts).toHaveLength(1);
  });
});

describe("onFallback", () => {
  test("is told which provider failed, and why", async () => {
    const warn = vi.spyOn(console, "warn");
    const seen: Array<[ApiProvider, number | undefined]> = [];
    const { fetch } = hosts({
      [MEMPOOL]: status(429, "slow down"),
      [BLOCKSTREAM]: ok("3"),
    });
    const api = new BitcoinAPI(NETWORKS.testnet, undefined, {
      fetch,
      onFallback: (provider, error) => seen.push([provider, error.status]),
    });
    await api.getBlockHeight();
    expect(seen).toEqual([["mempool", 429]]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test("is not called when the last provider fails, or when the first answers", async () => {
    const onFallback = vi.fn();
    const down = hosts({ [MEMPOOL]: status(500) });
    await new BitcoinAPI("testnet", "mempool", {
      fetch: down.fetch,
      onFallback,
    })
      .getBlockHeight()
      .catch(() => {});
    const up = hosts({ [MEMPOOL]: ok("1") });
    await new BitcoinAPI("testnet", undefined, {
      fetch: up.fetch,
      onFallback,
    }).getBlockHeight();
    expect(onFallback).not.toHaveBeenCalled();
  });
});

describe("broadcasting a transaction a provider already has", () => {
  const known: Array<[string, number, string]> = [
    [
      "already in block chain",
      400,
      'sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}',
    ],
    [
      "txn-already-known",
      400,
      'sendrawtransaction RPC error: {"code":-26,"message":"txn-already-known"}',
    ],
    [
      "txn-already-in-mempool",
      400,
      'sendrawtransaction RPC error: {"code":-27,"message":"txn-already-in-mempool"}',
    ],
    [
      "confirmed (Bitcoin Core 25 and later)",
      400,
      'sendrawtransaction RPC error: {"code":-27,"message":"Transaction outputs already in utxo set"}',
    ],
  ];
  test.each(known)("%s: succeeds with the txid", async (_name, code, body) => {
    const { asked, fetch } = hosts({ [MEMPOOL]: status(code, body) });
    const api = new BitcoinAPI("bitcoin", undefined, { fetch });
    expect(await api.broadcastTransaction(SEGWIT_TX.hex)).toEqual({
      txid: SEGWIT_TX.txid,
    });
    expect(asked).toEqual([MEMPOOL]);
  });

  test("BlockCypher's wording", async () => {
    const { fetch } = hosts({
      [BLOCKCYPHER]: status(
        400,
        `{"error": "Transaction with hash ${SEGWIT_TX.txid} already exists."}`
      ),
    });
    const api = new BitcoinAPI("bitcoin", "blockcypher", { fetch });
    expect(await api.broadcastTransaction(SEGWIT_TX.hex)).toEqual({
      txid: SEGWIT_TX.txid,
    });
  });

  test("the first provider times out after taking it, the second already has it", async () => {
    const { asked, fetch } = hosts({
      [MEMPOOL]: status(504, "Gateway Timeout"),
      [BLOCKSTREAM]: status(
        400,
        'sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}'
      ),
    });
    const api = new BitcoinAPI("bitcoin", undefined, { fetch });
    expect(await api.broadcastTransaction(SEGWIT_TX.hex)).toEqual({
      txid: SEGWIT_TX.txid,
    });
    expect(asked).toEqual([MEMPOOL, BLOCKSTREAM]);
  });

  test("hex that is not a transaction keeps the provider's error", async () => {
    const { fetch } = hosts({ [MEMPOOL]: status(400, "txn-already-known") });
    const api = new BitcoinAPI("bitcoin", "mempool", { fetch });
    await expect(api.broadcastTransaction("zz")).rejects.toThrow(
      "Failed to broadcast transaction: API Error 400: txn-already-known"
    );
  });
});
