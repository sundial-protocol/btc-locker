/**
 * Bitcoin API Service
 * Integrates with various Bitcoin APIs for testnet/mainnet operations
 */

import { NETWORKS, type BitcoinNetwork, type NetworkName } from "./network.js";

/**
 * Bitcoin UTXO with API status information
 * @interface ApiUTXO
 * @description UTXO from Bitcoin API with confirmation status.
 * Structurally compatible with btc-locker's `UTXO`.
 */
export interface ApiUTXO {
  txid: string;
  vout: number;
  value: number;
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

export interface BitcoinAPIOptions {
  /** The `fetch` to call. Defaults to the global one. */
  fetch?: typeof fetch;
  /** Milliseconds before a request is abandoned. Defaults to 30000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Base URL of each provider on each network it serves. */
const BASE_URLS: ApiUrls = {
  mempool: {
    bitcoin: "https://mempool.space/api",
    testnet: "https://mempool.space/testnet/api",
    testnet4: "https://mempool.space/testnet4/api",
  },
  // Blockstream and BlockCypher do not serve testnet4 (checked 2026-10-12).
  blockstream: {
    bitcoin: "https://blockstream.info/api",
    testnet: "https://blockstream.info/testnet/api",
  },
  blockcypher: {
    bitcoin: "https://api.blockcypher.com/v1/btc/main",
    testnet: "https://api.blockcypher.com/v1/btc/test3",
  },
};

// Browsers refuse a User-Agent set by a page, so it is only sent elsewhere.
const IN_BROWSER =
  typeof (globalThis as { document?: unknown }).document !== "undefined";
const USER_AGENT = "btc-locker-cli/1.0.0";

export default class BitcoinAPI<N extends BitcoinNetwork = BitcoinNetwork> {
  private network: N;
  private apiProvider: ApiProvider;

  get provider(): ApiProvider {
    return this.apiProvider;
  }

  get networkType(): N {
    return this.network;
  }
  private baseUrl: string;
  private fetchFn: typeof fetch;
  private timeoutMs: number;

  /**
   * @param network - A network name ("bitcoin", "testnet", "testnet4") or an
   * object with that name, such as a `NetworkType`.
   */
  constructor(
    network: N | NetworkName,
    apiProvider: ApiProvider = "mempool",
    options: BitcoinAPIOptions = {},
  ) {
    const resolved = (
      typeof network === "string" ? NETWORKS[network] : network
    ) as N | undefined;
    if (!resolved) {
      throw new Error(
        `Unknown network '${String(network)}'. Use 'bitcoin', 'testnet' or 'testnet4'.`,
      );
    }

    // Validate network support
    if (resolved.name === "regtest") {
      throw new Error(
        "Regtest network is not supported. Use 'bitcoin', 'testnet' or 'testnet4' instead.",
      );
    }

    const baseUrl = BASE_URLS[apiProvider]?.[resolved.name];
    if (!baseUrl) {
      throw new Error(
        `API provider '${apiProvider}' does not serve the '${resolved.name}' network.`,
      );
    }

    this.network = resolved;
    this.apiProvider = apiProvider;
    this.baseUrl = baseUrl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn =
      options.fetch ??
      ((input, init) => {
        if (typeof globalThis.fetch !== "function") {
          throw new Error(
            "No global fetch. Use Node 18 or later, or pass one in the options.",
          );
        }
        return globalThis.fetch(input, init);
      });
  }

  /**
   * Send one request and return the body of a 2xx response.
   */
  private async send(
    endpoint: string,
    method: "GET" | "POST",
    contentType?: string,
    body?: string,
  ): Promise<string> {
    const headers: Record<string, string> = {};
    if (contentType) headers["Content-Type"] = contentType;
    if (!IN_BROWSER) headers["User-Agent"] = USER_AGENT;

    let response: Response;
    let text: string;
    try {
      response = await this.fetchFn(`${this.baseUrl}${endpoint}`, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const { name, message, cause } = error as Error & { cause?: unknown };
      if (name === "TimeoutError") {
        throw new Error(`Request timed out after ${this.timeoutMs}ms`, {
          cause: error,
        });
      }
      // Node's fetch says only "fetch failed"; the reason is in the cause.
      const reason = (cause as { message?: string } | undefined)?.message;
      throw new Error(reason ? `${message}: ${reason}` : message, {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new Error(`API Error ${response.status}: ${text}`);
    }
    return text;
  }

  /**
   * Make HTTP request for raw text responses
   */
  async makeRequestText(endpoint: string): Promise<string> {
    return (await this.send(endpoint, "GET")).trim();
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
    const body = await this.send(
      endpoint,
      method,
      "application/json",
      data && method !== "GET" ? JSON.stringify(data) : undefined,
    );
    try {
      return body ? JSON.parse(body) : {};
    } catch (error) {
      throw new Error(`Parse Error: ${(error as Error).message}`);
    }
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
        BASE_URLS.blockstream[this.network.name] &&
        (errorMsg.includes("invalid network") ||
          errorMsg.includes("API Error 400"))
      ) {
        console.warn(
          `Mempool API failed for ${address}, trying Blockstream as fallback...`,
        );
        try {
          const fallbackApi = new BitcoinAPI(this.network, "blockstream", {
            fetch: this.fetchFn,
            timeoutMs: this.timeoutMs,
          });
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
    // Return the response as-is (usually the txid)
    const body = await this.send(endpoint, "POST", "text/plain", txHex);
    return { txid: body.trim() };
  }

  /**
   * Get confirmed UTXOs for an address.
   */
  async fetchConfirmedUtxos(address: string): Promise<ApiUTXO[]> {
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
