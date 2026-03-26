/**
 * Bitcoin API Service
 * Integrates with various Bitcoin APIs for testnet/mainnet operations
 */

import https from "https";
import type { UTXO } from "./types.js";
import type { NetworkType } from "./utils/network.js";

/**
 * Bitcoin UTXO with API status information
 * @interface ApiUTXO
 * @description UTXO from Bitcoin API with confirmation status
 * @extends UTXO
 */
export interface ApiUTXO extends UTXO {
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
  };
}

export type ApiProvider = "mempool" | "blockstream" | "blockcypher";

export interface ApiUrls {
  [provider: string]: {
    [network: string]: string;
  };
}

export interface AddressInfo {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

export interface FeeEstimates {
  [blocks: number]: number;
}

export interface BroadcastResult {
  txid: string;
}

export default class BitcoinAPI {
  private network: NetworkType;
  private apiProvider: ApiProvider;
  private baseUrls: ApiUrls;
  private baseUrl: string;

  constructor(network: NetworkType, apiProvider: ApiProvider = "mempool") {
    // Validate network support
    if (network.name === "regtest") {
      throw new Error(
        "Regtest network is not supported. Use 'bitcoin' or 'testnet' instead.",
      );
    }

    this.network = network;
    this.apiProvider = apiProvider;
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
   * Make HTTP request for raw text responses
   */
  async makeRequestText(endpoint: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${endpoint}`;
      const urlObj = new URL(url);

      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: "GET",
        headers: {
          "User-Agent": "btc-locker-cli/1.0.0",
        },
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

  /**
   * Make HTTP request
   */
  async makeRequest(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    data: any = null,
    // eslint-disable-next-line
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
        if (options.headers) {
          (options.headers as any)["Content-Length"] =
            Buffer.byteLength(postData);
        }
      }

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const result = body ? JSON.parse(body) : {};
              resolve(result);
            } catch (error) {
              reject(new Error(`Parse Error: ${(error as Error).message}`));
            }
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on("error", reject);

      if (data && method !== "GET") {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * Get address balance and transaction count
   */
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
      throw new Error(
        `Failed to get address info: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get UTXOs for an address
   */
  async getAddressUtxos(address: string): Promise<ApiUTXO[]> {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        const rawUtxos = await this.makeRequest(`/address/${address}/utxo`);

        // Return flat UTXO structure with status attached
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

      // If using mempool and network error occurs, try blockstream as fallback
      if (
        this.apiProvider === "mempool" &&
        (errorMsg.includes("invalid network") ||
          errorMsg.includes("API Error 400"))
      ) {
        console.warn(
          `Mempool API failed for ${address}, trying Blockstream as fallback...`,
        );
        try {
          const fallbackApi = new BitcoinAPI(this.network, "blockstream");
          return await fallbackApi.getAddressUtxos(address);
        } catch (fallbackError) {
          throw new Error(
            `Failed to get UTXOs (tried multiple APIs): ${errorMsg}; Fallback: ${(fallbackError as Error).message}`,
          );
        }
      }

      throw new Error(`Failed to get UTXOs: ${errorMsg}`);
    }
  }

  /**
   * Get raw transaction data
   */
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

  /**
   * Broadcast transaction to network
   */
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

  /**
   * Make broadcast request (for raw hex data)
   */
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
            // Return the response as-is (usually the txid)
            resolve({ txid: body.trim() });
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on("error", (error) => reject(error));
      req.write(txHex);
      req.end();
    });
  }

  /**
   * Get confirmed UTXOs for an address.
   */
  async fetchConfirmedUtxos(address: string): Promise<UTXO[]> {
    const utxos = await this.getAddressUtxos(address);
    return utxos.filter((u) => u.status?.confirmed);
  }

  /**
   * Get current fee estimates
   */
  async getFeeEstimates(): Promise<FeeEstimates> {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        return await this.makeRequest("/fee-estimates");
      } else if (this.apiProvider === "blockcypher") {
        // BlockCypher doesn't have fee estimates, return defaults
        return {
          1: 20, // high priority (next block)
          6: 10, // medium priority (6 blocks)
          144: 5, // low priority (1 day)
        };
      }
      throw new Error("Unsupported API provider");
    } catch (error) {
      throw new Error(
        `Failed to get fee estimates: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get current block height
   */
  async getBlockHeight(): Promise<number> {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        const tip = await this.makeRequest("/blocks/tip/height");
        return tip;
      } else if (this.apiProvider === "blockcypher") {
        const result = await this.makeRequest("/");
        return result.height;
      }
      throw new Error("Unsupported API provider");
    } catch (error) {
      throw new Error(
        `Failed to get block height: ${(error as Error).message}`,
      );
    }
  }
}
