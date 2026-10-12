import { describe, test, expect, vi, beforeEach, afterAll } from "vitest";
import BitcoinAPI from "../src/bitcoin-api";
import { NETWORKS } from "../src/network";

// The class calls the global fetch unless one is passed in the options.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterAll(() => vi.unstubAllGlobals());

function mockRequest(body: string, statusCode = 200) {
  fetchMock.mockImplementation(
    async () => new Response(body, { status: statusCode }),
  );
  return fetchMock;
}

function mockRequestError(errorMessage: string) {
  fetchMock.mockRejectedValue(new Error(errorMessage));
  return fetchMock;
}

/** The URL and init of the nth call to a fake fetch. */
function call(mock: ReturnType<typeof vi.fn>, n = 0) {
  const [url, init] = mock.mock.calls[n] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
}

describe("BitcoinAPI", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  describe("constructor", () => {
    test("should create with default mempool provider", () => {
      const api = new BitcoinAPI(NETWORKS.testnet);
      expect(api).toBeDefined();
    });

    test("should create with blockstream provider", () => {
      const api = new BitcoinAPI(NETWORKS.testnet, "blockstream");
      expect(api).toBeDefined();
    });

    test("should create with blockcypher provider", () => {
      const api = new BitcoinAPI(NETWORKS.testnet, "blockcypher");
      expect(api).toBeDefined();
    });

    test("should create with mainnet network", () => {
      const api = new BitcoinAPI(NETWORKS.bitcoin);
      expect(api).toBeDefined();
    });

    test("should throw for regtest network", () => {
      expect(() => new BitcoinAPI(NETWORKS.regtest)).toThrow(
        "Regtest network is not supported",
      );
      expect(() => new BitcoinAPI("regtest")).toThrow(
        "Regtest network is not supported",
      );
    });

    test("should accept a network name", async () => {
      mockRequest("1");
      const api = new BitcoinAPI("testnet");
      expect(api.networkType).toBe(NETWORKS.testnet);
      await api.getBlockHeight();
      expect(call(fetchMock).url).toBe(
        "https://mempool.space/testnet/api/blocks/tip/height",
      );
    });

    test("should accept any object with a network name", async () => {
      mockRequest("1");
      const network = { name: "bitcoin" } as const;
      const api = new BitcoinAPI(network, "blockstream");
      expect(api.networkType).toBe(network);
      await api.getBlockHeight();
      expect(call(fetchMock).url).toBe(
        "https://blockstream.info/api/blocks/tip/height",
      );
    });

    test("should throw for an unknown network name", () => {
      expect(() => new BitcoinAPI("signet" as any)).toThrow(
        "Unknown network 'signet'",
      );
    });
  });

  describe("testnet4", () => {
    test("has testnet's address parameters under its own name", () => {
      expect(NETWORKS.testnet4.name).toBe("testnet4");
      expect(NETWORKS.testnet4.info).toEqual(NETWORKS.testnet.info);
    });

    test("mempool: should use the testnet4 endpoint", async () => {
      mockRequest("120000");
      const api = new BitcoinAPI("testnet4");
      expect(await api.getBlockHeight()).toBe(120000);
      expect(call(fetchMock).url).toBe(
        "https://mempool.space/testnet4/api/blocks/tip/height",
      );
    });

    test.each(["blockstream", "blockcypher"] as const)(
      "%s: should throw, it does not serve testnet4",
      (provider) => {
        expect(() => new BitcoinAPI(NETWORKS.testnet4, provider)).toThrow(
          `API provider '${provider}' does not serve the 'testnet4' network.`,
        );
      },
    );

    test("should not fall back to a provider that does not serve it", async () => {
      mockRequest("invalid network", 400);
      const api = new BitcoinAPI("testnet4");
      await expect(api.getAddressUtxos("tb1test")).rejects.toThrow(
        "Failed to get UTXOs: API Error 400: invalid network",
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("fetch", () => {
    test("should use the fetch passed in the options", async () => {
      const injected = vi.fn(async () => new Response("7"));
      const api = new BitcoinAPI("testnet", "mempool", { fetch: injected });
      expect(await api.getBlockHeight()).toBe(7);
      expect(injected).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("should pass the injected fetch on to the fallback provider", async () => {
      const injected = vi
        .fn()
        .mockResolvedValueOnce(new Response("bad", { status: 400 }))
        .mockResolvedValueOnce(new Response("[]"));
      const api = new BitcoinAPI("testnet", "mempool", { fetch: injected });
      expect(await api.getAddressUtxos("tb1test")).toEqual([]);
      expect(call(injected, 1).url).toBe(
        "https://blockstream.info/testnet/api/address/tb1test/utxo",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("should send a User-Agent outside the browser", async () => {
      mockRequest("{}");
      await new BitcoinAPI("testnet").makeRequest("/test");
      expect(call(fetchMock).headers["User-Agent"]).toBe("btc-locker-cli/1.0.0");
    });

    test("should report the cause of a failed fetch", async () => {
      fetchMock.mockRejectedValue(
        new TypeError("fetch failed", {
          cause: new Error("getaddrinfo ENOTFOUND mempool.space"),
        }),
      );
      await expect(new BitcoinAPI("testnet").getBlockHeight()).rejects.toThrow(
        "Failed to get block height: fetch failed: getaddrinfo ENOTFOUND mempool.space",
      );
    });

    test("should give up after the timeout", async () => {
      // A fetch that never answers, and rejects when its signal aborts.
      const hanging = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal!.addEventListener("abort", () =>
              reject(init.signal!.reason),
            );
          }),
      );
      const api = new BitcoinAPI("testnet", "mempool", {
        fetch: hanging as unknown as typeof fetch,
        timeoutMs: 20,
      });
      await expect(api.makeRequestText("/slow")).rejects.toThrow(
        "Request timed out after 20ms",
      );
    });
  });

  describe("makeRequest", () => {
    test("should parse JSON response", async () => {
      mockRequest('{"foo":"bar"}');
      const api = new BitcoinAPI(NETWORKS.testnet);
      const result = await api.makeRequest("/test");
      expect(result).toEqual({ foo: "bar" });
    });

    test("should reject on non-2xx status", async () => {
      mockRequest("not found", 404);
      const api = new BitcoinAPI(NETWORKS.testnet);
      await expect(api.makeRequest("/bad")).rejects.toThrow("API Error 404");
    });

    test("should reject on parse error", async () => {
      mockRequest("not-json", 200);
      const api = new BitcoinAPI(NETWORKS.testnet);
      await expect(api.makeRequest("/bad-json")).rejects.toThrow("Parse Error");
    });

    test("should reject on network error", async () => {
      mockRequestError("ECONNREFUSED");
      const api = new BitcoinAPI(NETWORKS.testnet);
      await expect(api.makeRequest("/fail")).rejects.toThrow("ECONNREFUSED");
    });

    test("should handle POST with data", async () => {
      const req = mockRequest('{"ok":true}');
      const api = new BitcoinAPI(NETWORKS.testnet);
      await api.makeRequest("/post", "POST", { data: 1 });
      expect(call(req).init.method).toBe("POST");
      expect(call(req).init.body).toBe('{"data":1}');
      expect(call(req).headers["Content-Type"]).toBe("application/json");
    });

    test("should handle empty body", async () => {
      mockRequest("", 200);
      const api = new BitcoinAPI(NETWORKS.testnet);
      const result = await api.makeRequest("/empty");
      expect(result).toEqual({});
    });
  });

  describe("makeRequestText", () => {
    test("should return raw text", async () => {
      mockRequest("  some-hex-data  ");
      const api = new BitcoinAPI(NETWORKS.testnet);
      const result = await api.makeRequestText("/tx/abc/hex");
      expect(result).toBe("some-hex-data");
    });

    test("should reject on non-2xx", async () => {
      mockRequest("error", 500);
      const api = new BitcoinAPI(NETWORKS.testnet);
      await expect(api.makeRequestText("/fail")).rejects.toThrow(
        "API Error 500",
      );
    });
  });

  describe("getAddressInfo", () => {
    test("mempool: should return address info", async () => {
      const data = {
        address: "tb1test",
        chain_stats: {
          funded_txo_count: 2,
          funded_txo_sum: 100000,
          spent_txo_count: 1,
          spent_txo_sum: 50000,
          tx_count: 3,
        },
        mempool_stats: {
          funded_txo_count: 0,
          funded_txo_sum: 0,
          spent_txo_count: 0,
          spent_txo_sum: 0,
          tx_count: 0,
        },
      };
      mockRequest(JSON.stringify(data));
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      const result = await api.getAddressInfo("tb1test");
      expect(result.address).toBe("tb1test");
      expect(result.chain_stats.tx_count).toBe(3);
    });

    test("blockcypher: should transform response", async () => {
      mockRequest(
        JSON.stringify({
          n_tx: 5,
          total_received: 200000,
          total_sent: 100000,
          unconfirmed_n_tx: 1,
          unconfirmed_balance: 10000,
        }),
      );
      const api = new BitcoinAPI(NETWORKS.testnet, "blockcypher");
      const result = await api.getAddressInfo("tb1test");
      expect(result.address).toBe("tb1test");
      expect(result.chain_stats.tx_count).toBe(5);
      expect(result.mempool_stats.funded_txo_count).toBe(1);
    });

    test("should wrap errors", async () => {
      mockRequestError("timeout");
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      await expect(api.getAddressInfo("tb1test")).rejects.toThrow(
        "Failed to get address info",
      );
    });
  });

  describe("getAddressUtxos", () => {
    test("mempool: should return UTXOs", async () => {
      const utxos = [
        {
          txid: "a".repeat(64),
          vout: 0,
          value: 50000,
          status: { confirmed: true, block_height: 100 },
        },
      ];
      mockRequest(JSON.stringify(utxos));
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      const result = await api.getAddressUtxos("tb1test");
      expect(result).toHaveLength(1);
      expect(result[0].txid).toBe("a".repeat(64));
      expect(result[0].value).toBe(50000);
    });

    test("blockcypher: should transform UTXOs", async () => {
      mockRequest(
        JSON.stringify({
          txrefs: [
            {
              tx_hash: "b".repeat(64),
              tx_output_n: 1,
              value: 30000,
              confirmations: 6,
              block_height: 200,
            },
          ],
        }),
      );
      const api = new BitcoinAPI(NETWORKS.testnet, "blockcypher");
      const result = await api.getAddressUtxos("tb1test");
      expect(result).toHaveLength(1);
      expect(result[0].txid).toBe("b".repeat(64));
      expect(result[0].vout).toBe(1);
      expect(result[0].status.confirmed).toBe(true);
    });

    test("blockcypher: should handle empty txrefs", async () => {
      mockRequest(JSON.stringify({}));
      const api = new BitcoinAPI(NETWORKS.testnet, "blockcypher");
      const result = await api.getAddressUtxos("tb1test");
      expect(result).toEqual([]);
    });

    test("mempool: should fallback to blockstream on 400 error", async () => {
      const utxos = [
        {
          txid: "c".repeat(64),
          vout: 0,
          value: 10000,
          status: { confirmed: true },
        },
      ];
      fetchMock
        // First call (mempool) - return 400
        .mockResolvedValueOnce(
          new Response("API Error 400: invalid", { status: 400 }),
        )
        // Second call (blockstream fallback) - return success
        .mockResolvedValueOnce(new Response(JSON.stringify(utxos)));
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      const result = await api.getAddressUtxos("tb1test");
      expect(result).toHaveLength(1);
      expect(result[0].txid).toBe("c".repeat(64));
      expect(call(fetchMock, 0).url).toContain("https://mempool.space/");
      expect(call(fetchMock, 1).url).toContain("https://blockstream.info/");
    });

    test("should throw when fallback also fails", async () => {
      mockRequest("API Error 400: bad", 400);
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      await expect(api.getAddressUtxos("tb1test")).rejects.toThrow(
        "tried multiple APIs",
      );
    });

    test("non-mempool: should not fallback", async () => {
      mockRequestError("network error");
      const api = new BitcoinAPI(NETWORKS.testnet, "blockstream");
      await expect(api.getAddressUtxos("tb1test")).rejects.toThrow(
        "Failed to get UTXOs: network error",
      );
    });
  });

  describe("getTransaction", () => {
    test("mempool: should return transaction hex", async () => {
      mockRequest("0100000001abcdef");
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      const result = await api.getTransaction("a".repeat(64));
      expect(result).toBe("0100000001abcdef");
    });

    test("blockcypher: should return hex from JSON", async () => {
      mockRequest(JSON.stringify({ hex: "0200000001fedcba" }));
      const api = new BitcoinAPI(NETWORKS.testnet, "blockcypher");
      const result = await api.getTransaction("a".repeat(64));
      expect(result).toBe("0200000001fedcba");
    });

    test("should wrap errors", async () => {
      mockRequestError("timeout");
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      await expect(api.getTransaction("a".repeat(64))).rejects.toThrow(
        "Failed to get transaction",
      );
    });
  });

  describe("broadcastTransaction", () => {
    test("mempool: should broadcast and return txid", async () => {
      const req = mockRequest("  txid123  ");
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      const result = await api.broadcastTransaction("rawhex");
      expect(result.txid).toBe("txid123");
      expect(call(req).url).toBe("https://mempool.space/testnet/api/tx");
      expect(call(req).init.method).toBe("POST");
      expect(call(req).init.body).toBe("rawhex");
      expect(call(req).headers["Content-Type"]).toBe("text/plain");
    });

    test("blockcypher: should broadcast via POST JSON", async () => {
      mockRequest(JSON.stringify({ txid: "txid456" }));
      const api = new BitcoinAPI(NETWORKS.testnet, "blockcypher");
      const result = await api.broadcastTransaction("rawhex");
      expect(result.txid).toBe("txid456");
    });

    test("should wrap errors", async () => {
      mockRequestError("rejected");
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      await expect(api.broadcastTransaction("bad")).rejects.toThrow(
        "Failed to broadcast transaction",
      );
    });
  });

  describe("makeBroadcastRequest", () => {
    test("should reject on non-2xx", async () => {
      mockRequest("bad tx", 400);
      const api = new BitcoinAPI(NETWORKS.testnet);
      await expect(api.makeBroadcastRequest("/tx", "hex")).rejects.toThrow(
        "API Error 400",
      );
    });
  });

  describe("getFeeEstimates", () => {
    test("mempool: should return fee estimates", async () => {
      mockRequest(JSON.stringify({ 1: 25, 6: 15, 144: 5 }));
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      const result = await api.getFeeEstimates();
      expect(result[1]).toBe(25);
      expect(result[6]).toBe(15);
    });

    test("blockcypher: should return defaults", async () => {
      // blockcypher doesn't call API for fee estimates
      const api = new BitcoinAPI(NETWORKS.testnet, "blockcypher");
      const result = await api.getFeeEstimates();
      expect(result[1]).toBe(20);
      expect(result[6]).toBe(10);
      expect(result[144]).toBe(5);
    });

    test("should wrap errors", async () => {
      mockRequestError("fail");
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      await expect(api.getFeeEstimates()).rejects.toThrow(
        "Failed to get fee estimates",
      );
    });
  });

  describe("getBlockHeight", () => {
    test("mempool: should return block height", async () => {
      mockRequest("850000");
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      const result = await api.getBlockHeight();
      expect(result).toBe(850000);
    });

    test("blockcypher: should return height from JSON", async () => {
      mockRequest(JSON.stringify({ height: 850001 }));
      const api = new BitcoinAPI(NETWORKS.testnet, "blockcypher");
      const result = await api.getBlockHeight();
      expect(result).toBe(850001);
    });

    test("should wrap errors", async () => {
      mockRequestError("fail");
      const api = new BitcoinAPI(NETWORKS.testnet, "mempool");
      await expect(api.getBlockHeight()).rejects.toThrow(
        "Failed to get block height",
      );
    });
  });
});
