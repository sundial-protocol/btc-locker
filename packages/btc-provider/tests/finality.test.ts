import { describe, expect, test, vi } from "vitest";
import BitcoinAPI from "../src/bitcoin-api";
import { blockHashOfHeader, previousBlockHashOfHeader } from "../src/finality";
import recorded from "./finality-fixture.json";

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

describe("getFinalityProof", () => {
  test("returns the transaction, its merkle block and the six headers after", async () => {
    const { api } = chain(6);
    expect(await api.getFinalityProof(txid)).toEqual({ tx, proof, headers });
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

  test("refuses with 6 confirmations: six headers need 7", async () => {
    const { api, asked } = chain(5);
    await expect(api.getFinalityProof(txid)).rejects.toThrow(
      "it has 6 confirmation(s), and 6 header(s) after its block need 7.",
    );
    // Nothing was fetched beyond the status and the tip.
    expect(asked).toHaveLength(2);
  });

  test("refuses a bad header count", async () => {
    const { api } = chain();
    await expect(api.getFinalityProof(txid, -1)).rejects.toThrow("non-negative integer");
    await expect(api.getFinalityProof(txid, 1.5)).rejects.toThrow("non-negative integer");
  });

  describe("refuses pieces that do not fit together", () => {
    const mismatch = "the pieces do not fit together";

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
