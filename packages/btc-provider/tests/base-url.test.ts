import { describe, test, expect, vi } from "vitest";
import BitcoinAPI, { BitcoinAPIError } from "../src/bitcoin-api";
import { NETWORKS } from "../src/network";

/** A fake fetch that answers every request with one response and records the URLs. */
function answering(body: string, status = 200) {
  const urls: string[] = [];
  const fetchFn = vi.fn(async (url: string) => {
    urls.push(url);
    return new Response(body, { status });
  });
  return { urls, fetch: fetchFn as unknown as typeof fetch };
}

describe("baseUrl", () => {
  test("sends every request to the given server", async () => {
    const { urls, fetch } = answering("101");
    const api = new BitcoinAPI("bitcoin", undefined, {
      fetch,
      baseUrl: "https://mempool.example.com/api",
    });
    await api.getBlockHeight();
    expect(urls).toEqual(["https://mempool.example.com/api/blocks/tip/height"]);
    expect(api.provider).toBe("custom");
    expect(api.providers).toEqual(["custom"]);
  });

  test("makes regtest usable", async () => {
    const { urls, fetch } = answering("7");
    const api = new BitcoinAPI(NETWORKS.regtest, undefined, {
      fetch,
      baseUrl: "http://localhost:3002",
    });
    expect(api.networkType).toBe(NETWORKS.regtest);
    expect(await api.getBlockHeight()).toBe(7);
    expect(urls).toEqual(["http://localhost:3002/blocks/tip/height"]);
  });

  test("drops trailing slashes", async () => {
    const { urls, fetch } = answering("1");
    const api = new BitcoinAPI("regtest", undefined, {
      fetch,
      baseUrl: "http://localhost:3002/api//",
    });
    await api.getBlockHeight();
    expect(urls).toEqual(["http://localhost:3002/api/blocks/tip/height"]);
  });

  test("ignores the providers argument and never falls back", async () => {
    const { urls, fetch } = answering("down", 503);
    const onFallback = vi.fn();
    const api = new BitcoinAPI("testnet", ["mempool", "blockstream"], {
      fetch,
      onFallback,
      baseUrl: "http://localhost:3002",
    });
    const error = await api.getBlockHeight().catch((e) => e);
    expect(error).toBeInstanceOf(BitcoinAPIError);
    expect(error.provider).toBe("custom");
    expect(error.status).toBe(503);
    expect(error.message).toBe("Failed to get block height: API Error 503: down");
    expect(urls).toHaveLength(1);
    expect(onFallback).not.toHaveBeenCalled();
  });

  test("serves a network no public provider serves", () => {
    // Blockstream alone does not serve testnet4, but a baseUrl does.
    expect(() => new BitcoinAPI("testnet4", "blockstream")).toThrow();
    expect(
      () =>
        new BitcoinAPI("testnet4", "blockstream", {
          baseUrl: "http://localhost:3002",
        })
    ).not.toThrow();
  });

  test.each([
    ["not a url", "is not a URL"],
    ["localhost:3002", "must be an http or https URL"],
    ["ftp://example.com/api", "must be an http or https URL"],
    ["http://example.com/api?key=1", "must not have a query or fragment"],
    ["http://example.com/api#x", "must not have a query or fragment"],
  ])("rejects %s", (baseUrl, message) => {
    expect(() => new BitcoinAPI("regtest", undefined, { baseUrl })).toThrow(
      message
    );
  });

  test("regtest without a baseUrl still throws, and says how to fix it", () => {
    expect(() => new BitcoinAPI("regtest")).toThrow("give a baseUrl");
  });
});
