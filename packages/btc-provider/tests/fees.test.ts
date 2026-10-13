import { describe, expect, test, vi } from "vitest";
import BitcoinAPI from "../src/bitcoin-api";
import {
  DEFAULT_CHAIN_FEE_RATES,
  FeePriorities,
  defaultFeeRate,
  feeRateForPriority,
} from "../src/fees";

/** Fee estimates as Esplora returns them: sat/vB by confirmation target. */
const ESTIMATES = { 1: 25.4, 2: 22, 3: 18.2, 6: 12, 12: 6.1, 144: 2 };

/** An API whose every request is answered by `respond`. */
function apiAnswering(respond: (url: string) => Response, providers?: ("mempool" | "blockstream")[]) {
  const fetch = vi.fn(async (url: string) => respond(url));
  const api = new BitcoinAPI("testnet", providers ?? "mempool", {
    fetch: fetch as unknown as typeof globalThis.fetch,
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
});

describe("defaultFeeRate", () => {
  test("uses the shared fallback rates", () => {
    expect(defaultFeeRate(FeePriorities.HIGH)).toBe(DEFAULT_CHAIN_FEE_RATES.fastestFee);
    expect(defaultFeeRate(FeePriorities.MEDIUM)).toBe(DEFAULT_CHAIN_FEE_RATES.hourFee);
    expect(defaultFeeRate(FeePriorities.LOW)).toBe(DEFAULT_CHAIN_FEE_RATES.economyFee);
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

  test("returns the default rate when no provider answers", async () => {
    const { api } = apiAnswering(() => new Response("down", { status: 503 }));
    expect(await api.queryChainFeeRates(FeePriorities.HIGH)).toBe(20);
    expect(await api.queryChainFeeRates(FeePriorities.MEDIUM)).toBe(10);
    expect(await api.queryChainFeeRates(FeePriorities.LOW)).toBe(5);
  });
});
