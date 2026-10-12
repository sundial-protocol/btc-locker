/**
 * Bitcoin API Service
 * Integrates with various Bitcoin APIs for testnet/mainnet operations
 */

import { NETWORKS, type BitcoinNetwork, type NetworkName } from "./network.js";
import { transactionId } from "./txid.js";

/**
 * Bitcoin UTXO with API status information
 * @interface ApiUTXO
 * @description UTXO from Bitcoin API with confirmation status.
 * Has every field of btc-locker's `UTXO`, which it extended before it moved
 * here, so an API UTXO can be enriched and handed to the locker's builders.
 */
export interface ApiUTXO {
  txid: string;
  vout: number;
  value: number;
  /** Optional scriptPubKey hex of the output. The APIs do not return it; callers may fill it in. */
  scriptPubKey?: string;
  /** When true, the locker's UTXO selection skips this output. */
  doNotSpend?: boolean;
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
  /**
   * Called when a provider fails and the next one is about to be tried, with
   * the provider that failed and its error.
   */
  onFallback?: (provider: ApiProvider, error: BitcoinAPIError) => void;
}

/**
 * An error from a provider. `status` and `body` are set when the provider
 * answered; they are absent for a network error or a timeout. When several
 * providers were tried, these describe the last one and `attempts` holds all.
 */
export class BitcoinAPIError extends Error {
  readonly provider: ApiProvider;
  readonly status?: number;
  readonly body?: string;
  readonly attempts: BitcoinAPIError[];

  constructor(
    message: string,
    details: {
      provider: ApiProvider;
      status?: number;
      body?: string;
      cause?: unknown;
      attempts?: BitcoinAPIError[];
    }
  ) {
    super(message, { cause: details.cause });
    this.name = "BitcoinAPIError";
    this.provider = details.provider;
    this.status = details.status;
    this.body = details.body;
    this.attempts = details.attempts ?? [];
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** The providers tried, in order, when none is named. */
const DEFAULT_PROVIDERS: ApiProvider[] = ["mempool", "blockstream"];

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

/** mempool.space and Blockstream serve the same Esplora paths. */
const isEsplora = (provider: ApiProvider) =>
  provider === "mempool" || provider === "blockstream";

/**
 * Whether a failure says the provider is the problem, so the next one is worth
 * asking: no answer, rate limiting, a server error, an answer that is not what
 * was asked for, or mempool.space's "invalid network". Any other 4xx is an
 * answer about the request itself, and a second provider would say the same.
 */
function isProviderFailure(error: BitcoinAPIError): boolean {
  if (error.status === undefined) return true;
  if (error.status === 429 || error.status >= 500) return true;
  if (error.status < 300) return true; // a 2xx that could not be parsed
  return error.body?.includes("invalid network") ?? false;
}

/** What nodes answer when asked to broadcast a transaction they already have. */
const ALREADY_KNOWN =
  /txn-already-known|txn-already-in-mempool|already in (the )?block ?chain|outputs already in utxo set|already exists/i;

export default class BitcoinAPI<N extends BitcoinNetwork = BitcoinNetwork> {
  private network: N;
  private apiProviders: ApiProvider[];

  /** The provider asked first. */
  get provider(): ApiProvider {
    return this.apiProviders[0];
  }

  /** The providers asked, in order. */
  get providers(): ApiProvider[] {
    return [...this.apiProviders];
  }

  get networkType(): N {
    return this.network;
  }
  private fetchFn: typeof fetch;
  private timeoutMs: number;
  private onFallback?: BitcoinAPIOptions["onFallback"];

  /**
   * @param network - A network name ("bitcoin", "testnet", "testnet4") or an
   * object with that name, such as a `NetworkType`.
   * @param apiProvider - One provider, or several to try in order: when one
   * fails the next is asked. Defaults to mempool.space, then Blockstream.
   * Providers in a list that do not serve the network are left out.
   */
  constructor(
    network: N | NetworkName,
    apiProvider: ApiProvider | ApiProvider[] = DEFAULT_PROVIDERS,
    options: BitcoinAPIOptions = {}
  ) {
    const resolved = (
      typeof network === "string" ? NETWORKS[network] : network
    ) as N | undefined;
    if (!resolved) {
      throw new Error(
        `Unknown network '${String(
          network
        )}'. Use 'bitcoin', 'testnet' or 'testnet4'.`
      );
    }

    // Validate network support
    if (resolved.name === "regtest") {
      throw new Error(
        "Regtest network is not supported. Use 'bitcoin', 'testnet' or 'testnet4' instead."
      );
    }

    const asked = Array.isArray(apiProvider) ? apiProvider : [apiProvider];
    const serving = asked.filter(
      (provider, index) =>
        BASE_URLS[provider]?.[resolved.name] &&
        asked.indexOf(provider) === index
    );
    if (serving.length === 0) {
      throw new Error(
        Array.isArray(apiProvider)
          ? `None of the API providers (${asked.join(", ")}) serves the '${
              resolved.name
            }' network.`
          : `API provider '${apiProvider}' does not serve the '${resolved.name}' network.`
      );
    }

    this.network = resolved;
    this.apiProviders = serving;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onFallback = options.onFallback;
    this.fetchFn =
      options.fetch ??
      ((input, init) => {
        if (typeof globalThis.fetch !== "function") {
          throw new Error(
            "No global fetch. Use Node 18 or later, or pass one in the options."
          );
        }
        return globalThis.fetch(input, init);
      });
  }

  /**
   * Send one request to one provider and return the body of a 2xx response.
   */
  private async send(
    provider: ApiProvider,
    endpoint: string,
    method: "GET" | "POST",
    contentType?: string,
    body?: string
  ): Promise<string> {
    const headers: Record<string, string> = {};
    if (contentType) headers["Content-Type"] = contentType;
    if (!IN_BROWSER) headers["User-Agent"] = USER_AGENT;

    let response: Response;
    let text: string;
    try {
      response = await this.fetchFn(
        `${BASE_URLS[provider][this.network.name]}${endpoint}`,
        {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        }
      );
      text = await response.text();
    } catch (error) {
      const { name, message, cause } = error as Error & { cause?: unknown };
      if (name === "TimeoutError") {
        throw new BitcoinAPIError(
          `Request timed out after ${this.timeoutMs}ms`,
          { provider, cause: error }
        );
      }
      // Node's fetch says only "fetch failed"; the reason is in the cause.
      const reason = (cause as { message?: string } | undefined)?.message;
      throw new BitcoinAPIError(reason ? `${message}: ${reason}` : message, {
        provider,
        cause: error,
      });
    }

    if (!response.ok) {
      throw new BitcoinAPIError(`API Error ${response.status}: ${text}`, {
        provider,
        status: response.status,
        body: text,
      });
    }
    return text;
  }

  private async sendText(
    provider: ApiProvider,
    endpoint: string
  ): Promise<string> {
    return (await this.send(provider, endpoint, "GET")).trim();
  }

  private async sendJson(
    provider: ApiProvider,
    endpoint: string,
    method: "GET" | "POST" = "GET",
    data: any = null
    // eslint-disable-next-line
  ): Promise<any> {
    const body = await this.send(
      provider,
      endpoint,
      method,
      "application/json",
      data && method !== "GET" ? JSON.stringify(data) : undefined
    );
    try {
      return body ? JSON.parse(body) : {};
    } catch (error) {
      throw new BitcoinAPIError(`Parse Error: ${(error as Error).message}`, {
        provider,
        status: 200,
        body,
        cause: error,
      });
    }
  }

  private async sendBroadcast(
    provider: ApiProvider,
    endpoint: string,
    txHex: string
  ): Promise<BroadcastResult> {
    // Return the response as-is (usually the txid)
    const body = await this.send(
      provider,
      endpoint,
      "POST",
      "text/plain",
      txHex
    );
    return { txid: body.trim() };
  }

  /**
   * Ask each provider in turn until one answers. A provider is passed over
   * only when its failure is worth a second opinion: see isProviderFailure.
   *
   * @param what - Completes "Failed to ...", for the error message.
   */
  private async tryProviders<T>(
    what: string,
    ask: (provider: ApiProvider) => Promise<T>
  ): Promise<T> {
    const providers = this.apiProviders;
    const attempts: BitcoinAPIError[] = [];
    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      try {
        return await ask(provider);
      } catch (cause) {
        const error =
          cause instanceof BitcoinAPIError
            ? cause
            : // An answer of the wrong shape, most likely.
              new BitcoinAPIError((cause as Error).message, {
                provider,
                cause,
              });
        attempts.push(error);

        const next = providers[i + 1];
        if (!next || !isProviderFailure(error)) break;
        this.onFallback?.(provider, error);
      }
    }

    const last = attempts[attempts.length - 1];
    const message =
      attempts.length === 1
        ? `Failed to ${what}: ${last.message}`
        : `Failed to ${what} (tried multiple APIs): ${attempts
            .map((attempt) => `${attempt.provider}: ${attempt.message}`)
            .join("; ")}`;
    throw new BitcoinAPIError(message, {
      provider: last.provider,
      status: last.status,
      body: last.body,
      cause: last,
      attempts,
    });
  }

  /**
   * Make HTTP request for raw text responses, to the first provider. The
   * endpoint is that provider's own path, so there is no fallback here.
   */
  async makeRequestText(endpoint: string): Promise<string> {
    return this.sendText(this.provider, endpoint);
  }

  /**
   * Make HTTP request, to the first provider. The endpoint is that provider's
   * own path, so there is no fallback here.
   */
  async makeRequest(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    data: any = null
    // eslint-disable-next-line
  ): Promise<any> {
    return this.sendJson(this.provider, endpoint, method, data);
  }

  /**
   * Get address balance and transaction count
   */
  async getAddressInfo(address: string): Promise<AddressInfo> {
    return this.tryProviders("get address info", async (provider) => {
      if (isEsplora(provider)) {
        return await this.sendJson(provider, `/address/${address}`);
      } else if (provider === "blockcypher") {
        const result = await this.sendJson(
          provider,
          `/addrs/${address}/balance`
        );
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
    });
  }

  /**
   * Get UTXOs for an address
   */
  async getAddressUtxos(address: string): Promise<ApiUTXO[]> {
    return this.tryProviders("get UTXOs", async (provider) => {
      if (isEsplora(provider)) {
        const rawUtxos = await this.sendJson(
          provider,
          `/address/${address}/utxo`
        );

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
      } else if (provider === "blockcypher") {
        const result = await this.sendJson(
          provider,
          `/addrs/${address}?unspentOnly=true&includeScript=true`
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
    });
  }

  /**
   * Get raw transaction data
   */
  async getTransaction(txid: string): Promise<string> {
    return this.tryProviders("get transaction", async (provider) => {
      if (isEsplora(provider)) {
        return await this.sendText(provider, `/tx/${txid}/hex`);
      } else if (provider === "blockcypher") {
        const result = await this.sendJson(
          provider,
          `/txs/${txid}?includeHex=true`
        );
        return result.hex;
      }
      throw new Error("Unsupported API provider");
    });
  }

  /**
   * Broadcast transaction to network. A provider that answers that it already
   * has the transaction counts as success.
   */
  async broadcastTransaction(txHex: string): Promise<BroadcastResult> {
    return this.tryProviders("broadcast transaction", async (provider) => {
      try {
        if (isEsplora(provider)) {
          return await this.sendBroadcast(provider, "/tx", txHex);
        } else if (provider === "blockcypher") {
          return await this.sendJson(provider, "/txs/push", "POST", {
            tx: txHex,
          });
        }
      } catch (error) {
        if (
          error instanceof BitcoinAPIError &&
          error.body !== undefined &&
          ALREADY_KNOWN.test(error.body)
        ) {
          let txid: string;
          try {
            txid = transactionId(txHex);
          } catch {
            throw error;
          }
          return { txid };
        }
        throw error;
      }
      throw new Error("Unsupported API provider");
    });
  }

  /**
   * Make broadcast request (for raw hex data), to the first provider.
   */
  async makeBroadcastRequest(
    endpoint: string,
    txHex: string
  ): Promise<BroadcastResult> {
    return this.sendBroadcast(this.provider, endpoint, txHex);
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
    return this.tryProviders("get fee estimates", async (provider) => {
      if (isEsplora(provider)) {
        return await this.sendJson(provider, "/fee-estimates");
      } else if (provider === "blockcypher") {
        // BlockCypher doesn't have fee estimates, return defaults
        return {
          1: 20, // high priority (next block)
          6: 10, // medium priority (6 blocks)
          144: 5, // low priority (1 day)
        };
      }
      throw new Error("Unsupported API provider");
    });
  }

  /**
   * Get current block height
   */
  async getBlockHeight(): Promise<number> {
    return this.tryProviders("get block height", async (provider) => {
      if (isEsplora(provider)) {
        const tip = await this.sendJson(provider, "/blocks/tip/height");
        return tip;
      } else if (provider === "blockcypher") {
        const result = await this.sendJson(provider, "/");
        return result.height;
      }
      throw new Error("Unsupported API provider");
    });
  }
}
