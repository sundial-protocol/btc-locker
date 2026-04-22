/**
 * Bitcoin REST Client
 * Queries public Bitcoin APIs (mempool.space, blockstream.info, blockcypher)
 * with automatic provider failover on network errors.
 */

import https from "https";
import type { UTXO } from "../types.js";
import type { NetworkType } from "../utils/network.js";
import type {
  ApiProvider,
  ApiUrls,
  ApiUTXO,
  AddressInfo,
  BitcoinBlock,
  BitcoinTransaction,
  BroadcastResult,
  FeeEstimates,
} from "./types.js";

export class BitcoinRestClient {
  private network: NetworkType;
  readonly apiProvider: ApiProvider;
  private baseUrls: ApiUrls;
  private baseUrl: string;
  private isFallback: boolean;

  constructor(network: NetworkType, apiProvider: ApiProvider = "mempool", isFallback = false) {
    if (network.name === "regtest") {
      throw new Error(
        "Regtest network is not supported. Use 'bitcoin' or 'testnet' instead.",
      );
    }

    this.network = network;
    this.apiProvider = apiProvider;
    this.isFallback = isFallback;
    this.baseUrls = {
      mempool: {
        bitcoin: "https://mempool.space/api",
        testnet: "https://mempool.space/testnet/api",
      },
      blockstream: {
        bitcoin: "https://blockstream.info/api",
        testnet: "https://blockstream.info/testnet/api",
      },
      blockcypher: {
        bitcoin: "https://api.blockcypher.com/v1/btc/main",
        testnet: "https://api.blockcypher.com/v1/btc/test3",
      },
    };

    this.baseUrl = this.baseUrls[this.apiProvider][this.network.name];
  }

  /**
   * Returns true for errors that indicate a provider is unreachable and
   * warrant a failover to the next provider.
   */
  private isNetworkError(errorMsg: string): boolean {
    return (
      errorMsg.includes("ETIMEDOUT") ||
      errorMsg.includes("ECONNREFUSED") ||
      errorMsg.includes("ENOTFOUND") ||
      errorMsg.includes("ECONNRESET") ||
      errorMsg.includes("EHOSTUNREACH") ||
      errorMsg.includes("socket hang up") ||
      errorMsg.includes("invalid network") ||
      errorMsg.includes("API Error 400")
    );
  }

  /**
   * Cycles through all remaining providers when the current one is unreachable.
   */
  private async withProviderFallback<T>(
    operation: (client: BitcoinRestClient) => Promise<T>,
    errorPrefix: string,
    originalError: string,
  ): Promise<T> {
    const allProviders: ApiProvider[] = [
      "mempool",
      "blockstream",
      "blockcypher",
    ];
    const fallbacks = allProviders.filter((p) => p !== this.apiProvider);
    const errors: string[] = [`${this.apiProvider}: ${originalError}`];

    for (const provider of fallbacks) {
      console.warn(`${this.apiProvider} unreachable, trying ${provider}...`);
      try {
        return await operation(new BitcoinRestClient(this.network, provider, true));
      } catch (err) {
        const msg = (err as Error).message;
        errors.push(`${provider}: ${msg}`);
        if (!this.isNetworkError(msg)) break;
      }
    }

    throw new Error(
      `${errorPrefix} (tried multiple APIs, all failed): ${errors.join("; ")}`,
    );
  }

  async makeRequestText(endpoint: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${endpoint}`;
      const urlObj = new URL(url);

      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: "GET",
        headers: { "User-Agent": "btc-locker-cli/1.0.0" },
      };

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body.trim());
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on("error", reject);
      req.end();
    });
  }

   
  async makeRequest(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    data: any = null,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${endpoint}`;
      const urlObj = new URL(url);

      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "btc-locker-cli/1.0.0",
        },
      };

      if (data && method !== "GET") {
        const postData = JSON.stringify(data);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (options.headers as any)["Content-Length"] =
          Buffer.byteLength(postData);
      }

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(body ? JSON.parse(body) : {});
            } catch (error) {
              reject(new Error(`Parse Error: ${(error as Error).message}`));
            }
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on("error", reject);
      if (data && method !== "GET") req.write(JSON.stringify(data));
      req.end();
    });
  }

  async makeBroadcastRequest(
    endpoint: string,
    txHex: string,
  ): Promise<BroadcastResult> {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${endpoint}`;
      const urlObj = new URL(url);

      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "btc-locker-cli/1.0.0",
          "Content-Length": Buffer.byteLength(txHex),
        },
      };

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ txid: body.trim() });
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on("error", reject);
      req.write(txHex);
      req.end();
    });
  }

  async getAddressInfo(address: string): Promise<AddressInfo> {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        return await this.makeRequest(`/address/${address}`);
      } else if (this.apiProvider === "blockcypher") {
        const result = await this.makeRequest(`/addrs/${address}/balance`);
        return {
          address,
          chain_stats: {
            funded_txo_count: result.n_tx,
            funded_txo_sum: result.total_received,
            spent_txo_count: result.n_tx - result.unconfirmed_n_tx,
            spent_txo_sum: result.total_sent,
            tx_count: result.n_tx,
          },
          mempool_stats: {
            funded_txo_count: result.unconfirmed_n_tx,
            funded_txo_sum: result.unconfirmed_balance,
            spent_txo_count: 0,
            spent_txo_sum: 0,
            tx_count: result.unconfirmed_n_tx,
          },
        };
      }
      throw new Error("Unsupported API provider");
    } catch (error) {
      const errorMsg = (error as Error).message;
      if (!this.isFallback && this.isNetworkError(errorMsg)) {
        return this.withProviderFallback(
          (c) => c.getAddressInfo(address),
          "Failed to get address info",
          errorMsg,
        );
      }
      throw new Error(`Failed to get address info: ${errorMsg}`);
    }
  }

  async getAddressUtxos(address: string): Promise<ApiUTXO[]> {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
         
        const rawUtxos = await this.makeRequest(`/address/${address}/utxo`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rawUtxos.map((rawUtxo: any) => ({
          txid: rawUtxo.txid,
          vout: rawUtxo.vout,
          value: rawUtxo.value,
          status: rawUtxo.status || {
            confirmed: rawUtxo.status?.confirmed || false,
            block_height: rawUtxo.status?.block_height,
            block_hash: rawUtxo.status?.block_hash,
          },
        }));
      } else if (this.apiProvider === "blockcypher") {
        const result = await this.makeRequest(
          `/addrs/${address}?unspentOnly=true&includeScript=true`,
        );
         
        return (
          result.txrefs?.map((utxo: any) => ({
            txid: utxo.tx_hash,
            vout: utxo.tx_output_n,
            value: utxo.value,
            status: {
              confirmed: utxo.confirmations > 0,
              block_height: utxo.block_height,
              block_hash: utxo.block_hash,
            },
          })) || []
        );
      }
      throw new Error("Unsupported API provider");
    } catch (error) {
      const errorMsg = (error as Error).message;
      if (!this.isFallback && this.isNetworkError(errorMsg)) {
        return this.withProviderFallback(
          (c) => c.getAddressUtxos(address),
          "Failed to get UTXOs",
          errorMsg,
        );
      }
      throw new Error(`Failed to get UTXOs: ${errorMsg}`);
    }
  }

  async getTransaction(txid: string): Promise<string> {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        return await this.makeRequestText(`/tx/${txid}/hex`);
      } else if (this.apiProvider === "blockcypher") {
        const result = await this.makeRequest(`/txs/${txid}?includeHex=true`);
        return result.hex;
      }
      throw new Error("Unsupported API provider");
    } catch (error) {
      throw new Error(`Failed to get transaction: ${(error as Error).message}`);
    }
  }

  async broadcastTransaction(txHex: string): Promise<BroadcastResult> {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        return await this.makeBroadcastRequest("/tx", txHex);
      } else if (this.apiProvider === "blockcypher") {
        return await this.makeRequest("/txs/push", "POST", { tx: txHex });
      }
      throw new Error("Unsupported API provider");
    } catch (error) {
      throw new Error(
        `Failed to broadcast transaction: ${(error as Error).message}`,
      );
    }
  }

  async fetchConfirmedUtxos(address: string): Promise<UTXO[]> {
    const utxos = await this.getAddressUtxos(address);
    return utxos.filter((u) => u.status?.confirmed);
  }

  async getFeeEstimates(): Promise<FeeEstimates> {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        return await this.makeRequest("/fee-estimates");
      } else if (this.apiProvider === "blockcypher") {
        return { 1: 20, 6: 10, 144: 5 };
      }
      throw new Error("Unsupported API provider");
    } catch (error) {
      const errorMsg = (error as Error).message;
      if (!this.isFallback && this.isNetworkError(errorMsg)) {
        return this.withProviderFallback(
          (c) => c.getFeeEstimates(),
          "Failed to get fee estimates",
          errorMsg,
        );
      }
      throw new Error(`Failed to get fee estimates: ${errorMsg}`);
    }
  }

  async getBlockCount(): Promise<number> {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        return await this.makeRequest("/blocks/tip/height");
      } else if (this.apiProvider === "blockcypher") {
        const result = await this.makeRequest("/");
        return result.height;
      }
      throw new Error("Unsupported API provider");
    } catch (error) {
      const errorMsg = (error as Error).message;
      if (!this.isFallback && this.isNetworkError(errorMsg)) {
        return this.withProviderFallback(
          (c) => c.getBlockCount(),
          "Failed to get block count",
          errorMsg,
        );
      }
      throw new Error(`Failed to get block height: ${errorMsg}`);
    }
  }

  async getBlockHash(height: number): Promise<string> {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        return await this.makeRequestText(`/block-height/${height}`);
      } else if (this.apiProvider === "blockcypher") {
        const result = await this.makeRequest(`/blocks/${height}`);
        return result.hash;
      }
      throw new Error("Unsupported API provider");
    } catch (error) {
      const errorMsg = (error as Error).message;
      if (!this.isFallback && this.isNetworkError(errorMsg)) {
        return this.withProviderFallback(
          (c) => c.getBlockHash(height),
          "Failed to get block hash",
          errorMsg,
        );
      }
      throw new Error(`Failed to get block hash: ${errorMsg}`);
    }
  }

  /**
   * Fetch all transactions for a block, handling pagination.
   * mempool/blockstream return 25 txs per page; stops when a page is short or
   * the API returns a 400 (end of range).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchAllBlockTxs(hash: string): Promise<any[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txs: any[] = [];
    let startIndex = 0;
    while (true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let batch: any[];
      try {
        batch = await this.makeRequest(`/block/${hash}/txs/${startIndex}`);
      } catch (err) {
        // A 400 means start_index is past the end of the block — stop paging.
        if ((err as Error).message.includes("API Error 400")) break;
        throw err;
      }
      if (!batch || batch.length === 0) break;
      txs.push(...batch);
      if (batch.length < 25) break; // last page
      startIndex += batch.length;
    }
    return txs;
  }

  async getBlock(hash: string): Promise<BitcoinBlock> {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        const [meta, rawTxs] = await Promise.all([
          this.makeRequest(`/block/${hash}`),
          this.fetchAllBlockTxs(hash),
        ]);
        return {
          hash: meta.id,
          height: meta.height,
          time: meta.timestamp,
          mediantime: meta.mediantime,
          previousblockhash: meta.previousblockhash,
          tx: rawTxs.map(mapRestTxToRpc),
        };
      } else if (this.apiProvider === "blockcypher") {
        // blockcypher does not expose full vout details per block; fall back to
        // a provider that does.
        throw new Error("invalid network");
      }
      throw new Error("Unsupported API provider");
    } catch (error) {
      const errorMsg = (error as Error).message;
      if (!this.isFallback && this.isNetworkError(errorMsg)) {
        return this.withProviderFallback(
          (c) => c.getBlock(hash),
          "Failed to get block",
          errorMsg,
        );
      }
      throw new Error(`Failed to get block: ${errorMsg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRestTxToRpc(tx: any): BitcoinTransaction {
  return {
    txid: tx.txid,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vout: tx.vout.map((out: any, i: number) => ({
      n: i,
      value: out.value / 1e8, // satoshis → BTC
      valueSats: out.value,
      scriptPubKey: {
        hex: out.scriptpubkey,
        asm: out.scriptpubkey_asm,
        address: out.scriptpubkey_address,
        addresses: out.scriptpubkey_address
          ? [out.scriptpubkey_address]
          : undefined,
      },
    })),
  };
}
