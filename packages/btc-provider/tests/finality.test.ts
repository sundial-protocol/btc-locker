import { describe, expect, test, vi } from "vitest";
import BitcoinAPI from "../src/bitcoin-api";
import {
  CHARMS_FINALITY_TARGET_BITS,
  blockHashOfHeader,
  headerMeetsItsTarget,
  merkleBlockNames,
  merkleBlockTransactions,
  previousBlockHashOfHeader,
  targetOfBits,
  workOfBits,
  workOfHeader,
} from "../src/finality";
import recorded from "./finality-fixture.json";
import { LEGACY_TX } from "./fixtures";

const { txid, status, tx, proof, blocks } = recorded;
const HEIGHT = status.block_height;
const headers = blocks.map((block) => block.header);

const text = (body: string) => new Response(body);
const json = (body: unknown) => new Response(JSON.stringify(body));
const notFound = () => new Response("Not found", { status: 404 });

/**
 * The recorded chain behind Esplora's paths, with the tip `tipOffset` blocks
 * above the transaction's block. `override` answers a path differently.
 */
function chain(
  tipOffset = 6,
  override: { [path: string]: () => Response } = {},
  provider: "mempool" | "blockstream" | ("mempool" | "blockstream")[] = "mempool",
) {
  const asked: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    const { host, pathname } = new URL(url);
    const path = pathname.replace(/^\/api/, "");
    asked.push(`${host}${path}`);
    if (override[path]) return override[path]();
    if (override[`${host}${path}`]) return override[`${host}${path}`]();

    if (path === `/tx/${txid}/status`) return json(status);
    if (path === `/tx/${txid}/hex`) return text(tx);
    if (path === `/tx/${txid}/merkleblock-proof`) return text(proof);
    if (path === "/blocks/tip/height") return text(String(HEIGHT + tipOffset));
    const byHeight = /^\/block-height\/(\d+)$/.exec(path);
    if (byHeight) {
      const block = blocks.find((b) => b.height === Number(byHeight[1]));
      return block && block.height <= HEIGHT + tipOffset ? text(block.hash) : notFound();
    }
    const byHash = /^\/block\/([0-9a-f]{64})\/header$/.exec(path);
    if (byHash) {
      const block = blocks.find((b) => b.hash === byHash[1]);
      return block ? text(block.header) : notFound();
    }
    return notFound();
  });
  const api = new BitcoinAPI("bitcoin", provider, {
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  return { api, asked, fetch };
}

/** A header that is `header` with one byte of its nonce changed. */
const tampered = (header: string) => header.slice(0, -2) + (header.endsWith("00") ? "01" : "00");

describe("block headers", () => {
  test("hash to the block they belong to", () => {
    for (const block of blocks) expect(blockHashOfHeader(block.header)).toBe(block.hash);
  });

  test("name the block before", () => {
    expect(previousBlockHashOfHeader(headers[0])).toBe(status.block_hash);
    expect(previousBlockHashOfHeader(headers[1])).toBe(blocks[0].hash);
  });

  test("must be 80 bytes of hex", () => {
    expect(() => blockHashOfHeader(headers[0].slice(2))).toThrow("80 bytes of hex");
    expect(() => previousBlockHashOfHeader("zz".repeat(80))).toThrow("80 bytes of hex");
  });
});

describe("getTransactionStatus", () => {
  test("returns the block of a confirmed transaction", async () => {
    const { api, asked } = chain();
    expect(await api.getTransactionStatus(txid)).toEqual(status);
    expect(asked).toEqual([`mempool.space/tx/${txid}/status`]);
  });

  test("reports an unconfirmed transaction", async () => {
    const { api } = chain(6, { [`/tx/${txid}/status`]: () => json({ confirmed: false }) });
    expect(await api.getTransactionStatus(txid)).toEqual({ confirmed: false });
  });

  test("does not ask a second provider about an unknown transaction", async () => {
    const { api, asked } = chain(6, {}, ["mempool", "blockstream"]);
    const unknown = "00".repeat(32);
    await expect(api.getTransactionStatus(unknown)).rejects.toThrow(
      "Failed to get transaction status: API Error 404",
    );
    expect(asked).toEqual([`mempool.space/tx/${unknown}/status`]);
  });
});

describe("getConfirmations", () => {
  test("is 0 while unconfirmed, without asking for the tip", async () => {
    const { api, asked } = chain(6, { [`/tx/${txid}/status`]: () => json({ confirmed: false }) });
    expect(await api.getConfirmations(txid)).toBe(0);
    expect(asked).toHaveLength(1);
  });

  test.each([
    [0, 1],
    [5, 6],
    [6, 7],
  ])("with the tip %i block(s) above the transaction's block, is %i", async (offset, expected) => {
    expect(await chain(offset).api.getConfirmations(txid)).toBe(expected);
  });

  test("is at least 1 when the tip comes from a provider that is behind", async () => {
    expect(await chain(-1).api.getConfirmations(txid)).toBe(1);
  });
});

describe("proof pieces", () => {
  test("getMerkleBlockProof returns the merkle block", async () => {
    const { api, asked } = chain();
    expect(await api.getMerkleBlockProof(txid)).toBe(proof);
    expect(asked).toEqual([`mempool.space/tx/${txid}/merkleblock-proof`]);
  });

  test("getBlockHash and getBlockHeader read one block", async () => {
    const { api, asked } = chain();
    const hash = await api.getBlockHash(blocks[0].height);
    expect(hash).toBe(blocks[0].hash);
    expect(await api.getBlockHeader(hash)).toBe(blocks[0].header);
    expect(asked).toEqual([
      `mempool.space/block-height/${blocks[0].height}`,
      `mempool.space/block/${hash}/header`,
    ]);
  });

  test("fall back to the next provider", async () => {
    const { api, asked } = chain(
      6,
      { [`mempool.space/tx/${txid}/merkleblock-proof`]: () => new Response("", { status: 503 }) },
      ["mempool", "blockstream"],
    );
    expect(await api.getMerkleBlockProof(txid)).toBe(proof);
    expect(asked).toEqual([
      `mempool.space/tx/${txid}/merkleblock-proof`,
      `blockstream.info/tx/${txid}/merkleblock-proof`,
    ]);
  });
});

describe("merkle blocks", () => {
  /** The transaction's hash as it sits in the proof, in block byte order. */
  const inBlockOrder = (txid.match(/../g) as string[]).reverse().join("");
  /** Where the proof's hashes start: header, 4-byte count, 1-byte hash count. */
  const HASHES_AT = (80 + 4 + 1) * 2;
  /** The proof with its `n`th hash replaced by `hash`. */
  const withHash = (n: number, hash: string) =>
    proof.slice(0, HASHES_AT + n * 64) + hash + proof.slice(HASHES_AT + (n + 1) * 64);
  const hashAt = (n: number) => proof.slice(HASHES_AT + n * 64, HASHES_AT + (n + 1) * 64);

  test("prove the one transaction they were built for", () => {
    expect(merkleBlockTransactions(proof)).toEqual([txid]);
    expect(merkleBlockNames(proof, txid)).toBe(true);
    expect(merkleBlockNames(proof, txid.toUpperCase())).toBe(true);
  });

  test("do not prove a transaction that is not matched", () => {
    expect(merkleBlockNames(proof, "ab".repeat(32))).toBe(false);
    expect(merkleBlockNames(proof, "not a txid")).toBe(false);
  });

  test("are refused when a hash on the path is changed, though the txid is still in the bytes", () => {
    const leaf = [...Array(13).keys()].find((n) => hashAt(n) === inBlockOrder) as number;
    const sibling = leaf === 0 ? 1 : 0;
    const forged = withHash(sibling, "11".repeat(32));
    expect(forged).toContain(inBlockOrder);
    expect(() => merkleBlockTransactions(forged)).toThrow("does not hash to its header's merkle root");
    expect(merkleBlockNames(forged, txid)).toBe(false);
  });

  test("are refused when the transaction's own hash is changed", () => {
    const forged = proof.replace(inBlockOrder, "22".repeat(32));
    expect(() => merkleBlockTransactions(forged)).toThrow("merkle root");
  });

  test("are refused when malformed", () => {
    expect(() => merkleBlockTransactions(proof + "00")).toThrow("wrong length");
    expect(() => merkleBlockTransactions(proof.slice(0, -2))).toThrow("wrong length");
    expect(() => merkleBlockTransactions(proof.slice(0, 160))).toThrow("ends early");
    expect(() => merkleBlockTransactions("zz")).toThrow("is hex");
    // A transaction count of zero.
    expect(() => merkleBlockTransactions(proof.slice(0, 160) + "00000000" + proof.slice(168))).toThrow(
      "no transactions",
    );
    // More hashes claimed than the proof holds.
    expect(() => merkleBlockTransactions(proof.slice(0, 168) + "fd0010" + proof.slice(170))).toThrow();
  });
});

describe("proof of work", () => {
  test("target and work follow from the compact bits", () => {
    // Difficulty 1, the genesis block's target.
    expect(targetOfBits(0x1d00ffff)).toBe(0xffffn << 208n);
    expect(workOfBits(0x1d00ffff)).toBe(0x100010001n);
    expect(targetOfBits(0x03123456)).toBe(0x123456n);
    expect(targetOfBits(0x02123456)).toBe(0x1234n);
  });

  test("recorded headers meet the targets they state", () => {
    for (const header of [proof.slice(0, 160), ...headers]) {
      expect(headerMeetsItsTarget(header)).toBe(true);
    }
  });

  test("a header with a changed nonce does not", () => {
    expect(headerMeetsItsTarget(tampered(headers[0]))).toBe(false);
  });

  test("on 2026-10-13 Charms' requirement was the transaction's block plus six headers", () => {
    const required = workOfBits(CHARMS_FINALITY_TARGET_BITS);
    const sum = (list: string[]) => list.reduce((work, h) => work + workOfHeader(h), 0n);
    const block = proof.slice(0, 160);
    expect(sum([block, ...headers.slice(0, 5)])).toBeLessThan(required);
    expect(sum([block, ...headers])).toBeGreaterThanOrEqual(required);
  });
});

describe("getFinalityProof", () => {
  test("returns the transaction, its merkle block and the headers that reach Charms' work", async () => {
    const { api } = chain(6);
    expect(await api.getFinalityProof(txid)).toEqual({ tx, proof, headers });
  });

  test("stops at enough work, though more blocks exist", async () => {
    // One block at the old reference difficulty is a little more than one of
    // these, so the transaction's block and one header reach it.
    const { api, asked } = chain(6);
    const result = await api.getFinalityProof(txid, { targetBits: 0x1701e2a0 });
    expect(result.headers).toEqual(headers.slice(0, 1));
    expect(asked.filter((path) => path.endsWith("/header"))).toHaveLength(1);
  });

  test("needs no headers when the transaction's block alone holds the work", async () => {
    const { api } = chain(6);
    expect((await api.getFinalityProof(txid, { targetBits: 0x17021ef0 })).headers).toEqual([]);
  });

  test("accepts the txid in upper case", async () => {
    const upper = txid.toUpperCase();
    const { api } = chain(6, {
      [`/tx/${upper}/status`]: () => json(status),
      [`/tx/${upper}/hex`]: () => text(tx),
      [`/tx/${upper}/merkleblock-proof`]: () => text(proof),
    });
    expect(await api.getFinalityProof(upper)).toEqual({ tx, proof, headers });
  });

  test("takes the number of headers", async () => {
    expect(await chain(2).api.getFinalityProof(txid, 2)).toEqual({
      tx,
      proof,
      headers: headers.slice(0, 2),
    });
    expect((await chain(0).api.getFinalityProof(txid, 0)).headers).toEqual([]);
  });

  test("refuses an unconfirmed transaction", async () => {
    const { api } = chain(6, { [`/tx/${txid}/status`]: () => json({ confirmed: false }) });
    await expect(api.getFinalityProof(txid)).rejects.toThrow(
      `Cannot build a finality proof for ${txid}: it is not confirmed.`,
    );
  });

  test("refuses while the blocks after it do not hold enough work", async () => {
    const { api } = chain(5);
    await expect(api.getFinalityProof(txid)).rejects.toThrow(
      "its block and the 5 block(s) after it hold 88.8% of the work required. It has 6 confirmation(s); wait for more.",
    );
  });

  test("fetches no headers when the difficulty puts the work out of reach", async () => {
    // As on a test network: far more blocks would be needed than maxHeaders.
    const { api, asked } = chain(6);
    await expect(api.getFinalityProof(txid, { maxHeaders: 3 })).rejects.toThrow(
      "its block holds 14.8% of the work required. At that difficulty the proof would take about 6 header(s), and this call fetches at most 3.",
    );
    expect(asked.filter((path) => path.endsWith("/header"))).toHaveLength(0);
  });

  test("an exact count: six headers need 7 confirmations", async () => {
    const { api, asked } = chain(5);
    await expect(api.getFinalityProof(txid, 6)).rejects.toThrow(
      "it has 6 confirmation(s), and 6 header(s) after its block need 7.",
    );
    // Nothing was fetched beyond the status and the tip.
    expect(asked).toHaveLength(2);
  });

  test("an exact count is not held to the work", async () => {
    expect((await chain(6).api.getFinalityProof(txid, { headerCount: 3 })).headers).toEqual(
      headers.slice(0, 3),
    );
  });

  test("refuses a bad header count", async () => {
    const { api } = chain();
    await expect(api.getFinalityProof(txid, -1)).rejects.toThrow("non-negative integer");
    await expect(api.getFinalityProof(txid, 1.5)).rejects.toThrow("non-negative integer");
    await expect(api.getFinalityProof(txid, { maxHeaders: -1 })).rejects.toThrow(
      "maxHeaders must be a non-negative integer",
    );
  });

  describe("refuses pieces that do not fit together", () => {
    const mismatch = "the pieces do not fit together";

    test("a transaction other than the one asked for", async () => {
      const { api } = chain(6, { [`/tx/${txid}/hex`]: () => text(LEGACY_TX.hex) });
      await expect(api.getFinalityProof(txid)).rejects.toThrow(mismatch);
    });

    test("a merkle block that does not name the transaction", async () => {
      // The right block's header, but the transaction's hash is blanked out.
      const inBlockOrder = (txid.match(/../g) as string[]).reverse().join("");
      expect(proof).toContain(inBlockOrder);
      const { api } = chain(6, {
        [`/tx/${txid}/merkleblock-proof`]: () => text(proof.replace(inBlockOrder, "00".repeat(32))),
      });
      await expect(api.getFinalityProof(txid)).rejects.toThrow(mismatch);
    });

    test("a merkle block whose tree does not lead to the header's root", async () => {
      // The transaction's hash is still in the proof; a hash beside it is not the real one.
      const at = (80 + 4 + 1) * 2;
      const first = proof.slice(at, at + 64);
      const inBlockOrder = (txid.match(/../g) as string[]).reverse().join("");
      const n = first === inBlockOrder ? 1 : 0;
      const forged = proof.slice(0, at + n * 64) + "11".repeat(32) + proof.slice(at + (n + 1) * 64);
      expect(forged).toContain(inBlockOrder);
      const { api } = chain(6, { [`/tx/${txid}/merkleblock-proof`]: () => text(forged) });
      await expect(api.getFinalityProof(txid)).rejects.toThrow(mismatch);
    });

    test("a header that is not the block asked for", async () => {
      const { api } = chain(6, {
        [`/block/${blocks[2].hash}/header`]: () => text(tampered(blocks[2].header)),
      });
      await expect(api.getFinalityProof(txid)).rejects.toThrow(mismatch);
    });

    test("a block that does not build on the one before", async () => {
      // Height +2 answers with the block from height +3: a valid header, wrong parent.
      const { api } = chain(6, {
        [`/block-height/${blocks[1].height}`]: () => text(blocks[2].hash),
      });
      await expect(api.getFinalityProof(txid)).rejects.toThrow(mismatch);
    });

    test("a merkle block for another block", async () => {
      const { api } = chain(6, {
        [`/tx/${txid}/merkleblock-proof`]: () => text(blocks[0].header + proof.slice(160)),
      });
      await expect(api.getFinalityProof(txid)).rejects.toThrow(mismatch);
    });
  });

  test("passes a provider's failure on", async () => {
    const { api } = chain(6, {
      [`/tx/${txid}/merkleblock-proof`]: () => new Response("down", { status: 503 }),
    });
    await expect(api.getFinalityProof(txid)).rejects.toThrow(
      "Failed to get merkle block proof: API Error 503",
    );
  });
});
