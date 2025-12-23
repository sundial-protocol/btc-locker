/**
 * Bitcoin API Service
 * Integrates with various Bitcoin APIs for testnet/mainnet operations
 */

import https from "https";

class BitcoinAPI {
  constructor(network = "testnet", apiProvider = "mempool") {
    this.network = network;
    this.apiProvider = apiProvider;
    this.baseUrls = {
      mempool: {
        mainnet: "https://mempool.space/api",
        testnet: "https://mempool.space/testnet/api",
      },
      blockstream: {
        mainnet: "https://blockstream.info/api",
        testnet: "https://blockstream.info/testnet/api",
      },
      blockcypher: {
        mainnet: "https://api.blockcypher.com/v1/btc/main",
        testnet: "https://api.blockcypher.com/v1/btc/test3",
      },
    };

    this.baseUrl = this.baseUrls[apiProvider][network];
  }

  /**
   * Make HTTP request
   */
  async makeRequest(endpoint, method = "GET", data = null) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${endpoint}`;
      const urlObj = new URL(url);

      const options = {
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
        options.headers["Content-Length"] = Buffer.byteLength(postData);
      }

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const result = body ? JSON.parse(body) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(result);
            } else {
              reject(new Error(`API Error ${res.statusCode}: ${body}`));
            }
          } catch (error) {
            reject(new Error(`Parse Error: ${error.message}`));
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
  async getAddressInfo(address) {
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
    } catch (error) {
      throw new Error(`Failed to get address info: ${error.message}`);
    }
  }

  /**
   * Get UTXOs for an address
   */
  async getAddressUtxos(address) {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        return await this.makeRequest(`/address/${address}/utxo`);
      } else if (this.apiProvider === "blockcypher") {
        const result = await this.makeRequest(
          `/addrs/${address}?unspentOnly=true&includeScript=true`
        );
        return (
          result.txrefs?.map((utxo) => ({
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
    } catch (error) {
      throw new Error(`Failed to get UTXOs: ${error.message}`);
    }
  }

  /**
   * Get raw transaction data
   */
  async getTransaction(txid) {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        return await this.makeRequest(`/tx/${txid}/hex`);
      } else if (this.apiProvider === "blockcypher") {
        const result = await this.makeRequest(`/txs/${txid}?includeHex=true`);
        return result.hex;
      }
    } catch (error) {
      throw new Error(`Failed to get transaction: ${error.message}`);
    }
  }

  /**
   * Broadcast transaction to network
   */
  async broadcastTransaction(txHex) {
    try {
      if (
        this.apiProvider === "mempool" ||
        this.apiProvider === "blockstream"
      ) {
        return await this.makeBroadcastRequest("/tx", txHex);
      } else if (this.apiProvider === "blockcypher") {
        return await this.makeRequest("/txs/push", "POST", { tx: txHex });
      }
    } catch (error) {
      throw new Error(`Failed to broadcast transaction: ${error.message}`);
    }
  }

  /**
   * Make broadcast request (for raw hex data)
   */
  async makeBroadcastRequest(endpoint, txHex) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${endpoint}`;
      const urlObj = new URL(url);

      const options = {
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
          if (res.statusCode >= 200 && res.statusCode < 300) {
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
   * Get current fee estimates
   */
  async getFeeEstimates() {
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
    } catch (error) {
      throw new Error(`Failed to get fee estimates: ${error.message}`);
    }
  }

  /**
   * Get current block height
   */
  async getBlockHeight() {
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
    } catch (error) {
      throw new Error(`Failed to get block height: ${error.message}`);
    }
  }
}

export default BitcoinAPI;
