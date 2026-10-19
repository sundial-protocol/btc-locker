import { describe, expect, test, vi } from "vitest";
import BitcoinAPI from "../src/bitcoin-api";
import { FeePriorities, feeRateForPriority } from "../src/fees";

/** Fee estimates as Esplora returns them: sat/vB by confirmation target. */
const ESTIMATES = { 1: 25.4, 2: 22, 3: 18.2, 6: 12, 12: 6.1, 144: 2 };

/** An API whose every request is answered by `respond`. */
function apiAnswering(
  respond: (url: string) => Response,
  providers?: ("mempool" | "blockstream")[],
  fallbackFeeRates?: Record<FeePriorities, number>,
) {
  const fetch = vi.fn(async (url: string) => respond(url));
  const api = new BitcoinAPI("testnet", providers ?? "mempool", {
    fetch: fetch as unknown as typeof globalThis.fetch,
    fallbackFeeRates,
  });
  return { api, fetch };
}

const json = (body: unknown) => new Response(JSON.stringify(body));

describe("FeePriorities", () => {
  test("has the values callers pass as strings", () => {
    expect(FeePriorities.HIGH).toBe("high");
    expect(FeePriorities.MEDIUM).toBe("medium");
    expect(FeePriorities.LOW).toBe("low");
  });
});

describe("feeRateForPriority", () => {
  test("maps priorities to the next block, 3 to 6 blocks, and 12 or more", () => {
    expect(feeRateForPriority(ESTIMATES, FeePriorities.HIGH)).toBe(26);
    expect(feeRateForPriority(ESTIMATES, FeePriorities.MEDIUM)).toBe(19);
    expect(feeRateForPriority(ESTIMATES, FeePriorities.LOW)).toBe(7);
  });

  test("rounds up and never goes below 1 sat/vB", () => {
    const quiet = { 1: 0.2, 6: 0.1, 144: 0.05 };
    for (const priority of Object.values(FeePriorities)) {
      expect(feeRateForPriority(quiet, priority)).toBe(1);
    }
  });

  test("caps a rate at 1000 sat/vB", () => {
    expect(feeRateForPriority({ 1: 50_000 }, FeePriorities.HIGH)).toBe(1000);
  });

  test("derives missing targets from the ones present", () => {
    // Only a next-block estimate: medium is 70% of it, low half of medium.
    expect(feeRateForPriority({ 1: 20 }, FeePriorities.MEDIUM)).toBe(14);
    expect(feeRateForPriority({ 1: 20 }, FeePriorities.LOW)).toBe(7);
  });

  test("has no rate of its own to give when there are no estimates", () => {
    expect(() => feeRateForPriority({}, FeePriorities.HIGH)).toThrow("no fee estimates");
  });
});

describe("BitcoinAPI.queryChainFeeRates", () => {
  test("asks this API's network for fee estimates", async () => {
    const { api, fetch } = apiAnswering(() => json(ESTIMATES));
    expect(await api.queryChainFeeRates(FeePriorities.HIGH)).toBe(26);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("https://mempool.space/testnet/api/fee-estimates");
  });

  test("defaults to the medium priority", async () => {
    const { api } = apiAnswering(() => json(ESTIMATES));
    expect(await api.queryChainFeeRates()).toBe(19);
  });

  test("falls back to the next provider", async () => {
    const { api, fetch } = apiAnswering(
      (url) => (url.includes("mempool.space") ? new Response("down", { status: 503 }) : json(ESTIMATES)),
      ["mempool", "blockstream"],
    );
    expect(await api.queryChainFeeRates(FeePriorities.LOW)).toBe(7);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      "https://mempool.space/testnet/api/fee-estimates",
      "https://blockstream.info/testnet/api/fee-estimates",
    ]);
  });

  test("throws when no provider answers and the caller gave no fallback", async () => {
    const { api } = apiAnswering(() => new Response("down", { status: 503 }));
    await expect(api.queryChainFeeRates(FeePriorities.HIGH)).rejects.toThrow("Failed to get fee estimates");
    const empty = apiAnswering(() => json({})).api;
    await expect(empty.queryChainFeeRates()).rejects.toThrow("no fee estimates");
  });

  test("returns the caller's fallback rate when no provider answers", async () => {
    const fallback = { high: 30, medium: 12, low: 3 };
    const { api } = apiAnswering(() => new Response("down", { status: 503 }), undefined, fallback);
    expect(await api.queryChainFeeRates(FeePriorities.HIGH)).toBe(30);
    expect(await api.queryChainFeeRates(FeePriorities.MEDIUM)).toBe(12);
    expect(await api.queryChainFeeRates(FeePriorities.LOW)).toBe(3);
    const empty = apiAnswering(() => json({}), undefined, fallback).api;
    expect(await empty.queryChainFeeRates()).toBe(12);
  });
});
