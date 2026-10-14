/**
 * Bitcoin API Service
 * Talks to public Esplora APIs (mempool.space, Blockstream) for testnet/mainnet
 * operations. Both serve the same paths, so every call is one request that any
 * provider can answer.
 */

import { NETWORKS, type BitcoinNetwork, type NetworkName } from "./network.js";
import { transactionId } from "./txid.js";
import { FeePriorities, feeRateForPriority } from "./fees.js";
import {
  HEADER_HEX_LENGTH,
  blockHashOfHeader,
  headerMeetsItsTarget,
  merkleBlockTransactions,
  previousBlockHashOfHeader,
  workOfBits,
  workOfHeader,
  type FinalityProof,
  type TransactionStatus,
} from "./finality.js";

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

export type ApiProvider = "mempool" | "blockstream";

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
  /**
   * The User-Agent sent with each request outside a browser (browsers refuse
   * one set by a page). Defaults to "btc-provider"; null sends none.
   */
  userAgent?: string | null;
  /**
   * Fee rates in sat/vB, by priority, for `queryChainFeeRates` to return when
   * no provider answers. Without them it throws the providers' error, so a
   * caller never gets a rate it did not choose.
   */
  fallbackFeeRates?: Record<FeePriorities, number>;
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

/**
 * How many headers a finality proof carries. The caller says what its verifier
 * requires: either an exact count, or the work to reach. This package does not
 * know any verifier's rule.
 */
export type FinalityProofOptions =
  | {
      /**
       * Exactly this many headers after the transaction's block, whatever work
       * they hold.
       */
      headerCount: number;
      targetBits?: never;
      maxHeaders?: never;
    }
  | {
      /**
       * The work to reach, as compact target bits: headers are added until the
       * transaction's block and the blocks after it hold at least the work of
       * this target. Charms, for example, sets this as `FINALITY_TARGET_BITS`
       * in charms-client's `bitcoin_tx.rs`.
       */
      targetBits: number;
      /**
       * The most headers to fetch while adding up work (default 36). On a
       * network whose difficulty is far below the target, the work is never
       * enough, and the call fails after fetching this many.
       */
      maxHeaders?: number;
      headerCount?: never;
    };

const DEFAULT_TIMEOUT_MS = 30_000;

/** The most headers getFinalityProof fetches while adding up work. */
const DEFAULT_MAX_FINALITY_HEADERS = 36;

/** The most headers getFinalityProof asks for at once. */
const FINALITY_HEADER_BATCH = 12;

/** The providers tried, in order, when none is named. */
const DEFAULT_PROVIDERS: ApiProvider[] = ["mempool", "blockstream"];

/** Base URL of each provider on each network it serves. */
const BASE_URLS: ApiUrls = {
  mempool: {
    bitcoin: "https://mempool.space/api",
    testnet: "https://mempool.space/testnet/api",
    testnet4: "https://mempool.space/testnet4/api",
  },
  // Blockstream does not serve testnet4 (checked 2026-10-12).
  blockstream: {
    bitcoin: "https://blockstream.info/api",
    testnet: "https://blockstream.info/testnet/api",
  },
};

// Browsers refuse a User-Agent set by a page, so it is only sent elsewhere.
const IN_BROWSER =
  typeof (globalThis as { document?: unknown }).document !== "undefined";
const DEFAULT_USER_AGENT = "btc-provider";

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
  /txn-already-known|txn-already-in-mempool|already in (the )?block ?chain|outputs already in utxo set/i;

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
  private userAgent: string | null;
  private fallbackFeeRates?: Record<FeePriorities, number>;

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
    const unknown = asked.find((provider) => !BASE_URLS[provider]);
    if (unknown) {
      throw new Error(
        `Unknown API provider '${unknown}'. Use 'mempool' or 'blockstream'.`
      );
    }
    const serving = asked.filter(
      (provider, index) =>
        BASE_URLS[provider][resolved.name] && asked.indexOf(provider) === index
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
    this.userAgent =
      options.userAgent === undefined ? DEFAULT_USER_AGENT : options.userAgent;
    this.fallbackFeeRates = options.fallbackFeeRates;
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
    if (!IN_BROWSER && this.userAgent) headers["User-Agent"] = this.userAgent;

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
    return this.tryProviders("get address info", (provider) =>
      this.sendJson(provider, `/address/${address}`)
    );
  }

  /**
   * Get UTXOs for an address
   */
  async getAddressUtxos(address: string): Promise<ApiUTXO[]> {
    return this.tryProviders("get UTXOs", async (provider) => {
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
    });
  }

  /**
   * Get raw transaction data
   */
  async getTransaction(txid: string): Promise<string> {
    return this.tryProviders("get transaction", (provider) =>
      this.sendText(provider, `/tx/${txid}/hex`)
    );
  }

  /**
   * Broadcast transaction to network. A provider that answers that it already
   * has the transaction counts as success.
   */
  async broadcastTransaction(txHex: string): Promise<BroadcastResult> {
    return this.tryProviders("broadcast transaction", async (provider) => {
      try {
        return await this.sendBroadcast(provider, "/tx", txHex);
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
    return this.tryProviders("get fee estimates", (provider) =>
      this.sendJson(provider, "/fee-estimates")
    );
  }

  /**
   * Fee rate in sat/vB for a priority, from this API's providers. When none
   * of them answers, the `fallbackFeeRates` given to the constructor are used;
   * without them, the providers' error is thrown.
   */
  async queryChainFeeRates(
    priority: FeePriorities = FeePriorities.MEDIUM,
  ): Promise<number> {
    try {
      return feeRateForPriority(await this.getFeeEstimates(), priority);
    } catch (error) {
      const fallback = this.fallbackFeeRates?.[priority];
      if (fallback === undefined) throw error;
      return fallback;
    }
  }

  /**
   * Get current block height
   */
  async getBlockHeight(): Promise<number> {
    return this.tryProviders("get block height", (provider) =>
      this.sendJson(provider, "/blocks/tip/height")
    );
  }

  // ── Confirmations and finality proofs ──────────────────────────────────────

  /**
   * Whether a transaction is confirmed, and in which block.
   */
  async getTransactionStatus(txid: string): Promise<TransactionStatus> {
    return this.tryProviders("get transaction status", (provider) =>
      this.sendJson(provider, `/tx/${txid}/status`)
    );
  }

  /**
   * Confirmations of a transaction: 0 while unconfirmed, 1 once it is in the
   * tip block.
   */
  async getConfirmations(txid: string): Promise<number> {
    const status = await this.getTransactionStatus(txid);
    if (!status.confirmed || status.block_height === undefined) return 0;
    // The tip can come from a provider that is a block behind the one that
    // reported the status. A confirmed transaction has at least one.
    return Math.max(1, (await this.getBlockHeight()) - status.block_height + 1);
  }

  /**
   * Proof that a confirmed transaction is in its block: a BIP 37 merkle block,
   * hex. The same bytes as bitcoind's `gettxoutproof`.
   */
  async getMerkleBlockProof(txid: string): Promise<string> {
    return this.tryProviders("get merkle block proof", (provider) =>
      this.sendText(provider, `/tx/${txid}/merkleblock-proof`)
    );
  }

  /**
   * Hash of the block at a height on the best chain.
   */
  async getBlockHash(height: number): Promise<string> {
    return this.tryProviders("get block hash", (provider) =>
      this.sendText(provider, `/block-height/${height}`)
    );
  }

  /**
   * The 80-byte header of a block, hex.
   */
  async getBlockHeader(blockHash: string): Promise<string> {
    return this.tryProviders("get block header", (provider) =>
      this.sendText(provider, `/block/${blockHash}/header`)
    );
  }

  /**
   * Everything a verifier needs to accept a transaction as final: the raw
   * transaction, the proof that its block includes it, and the headers of the
   * blocks mined after that block.
   *
   * The caller says how many headers its verifier needs. With `targetBits`,
   * the headers are as many as it takes for the transaction's block and the
   * blocks after it to hold the work of that target. With a number, or
   * `headerCount`, there are exactly that many.
   *
   * The pieces are checked against each other before they are returned: the
   * transaction hashes to the id asked for, the merkle block is for its block
   * and its tree leads from the transaction to the header's merkle root, every
   * header hashes to the block it was asked for and meets its own target, and
   * each one builds on the one before. Providers are not trusted to agree, and
   * the chain can change between two requests.
   *
   * @throws If neither a count nor a target is given, if the transaction is
   * unconfirmed, if there are not yet enough blocks after it, or if the pieces
   * do not fit together.
   */
  async getFinalityProof(
    txid: string,
    options: number | FinalityProofOptions
  ): Promise<FinalityProof> {
    const {
      headerCount,
      targetBits,
      maxHeaders = DEFAULT_MAX_FINALITY_HEADERS,
    }: Partial<{ headerCount: number; targetBits: number; maxHeaders: number }> =
      typeof options === "number" ? { headerCount: options } : options ?? {};
    if ((headerCount === undefined) === (targetBits === undefined)) {
      throw new Error(
        "getFinalityProof needs either headerCount or targetBits, the work the verifier requires, and not both"
      );
    }
    if (
      targetBits !== undefined &&
      (!Number.isInteger(targetBits) ||
        targetBits <= 0 ||
        targetBits > 0xffffffff)
    ) {
      throw new Error("targetBits must be compact target bits, a 32-bit unsigned integer");
    }
    // The work to reach; not used when an exact count is given.
    const required = targetBits === undefined ? 0n : workOfBits(targetBits);
    if (
      headerCount !== undefined &&
      (!Number.isInteger(headerCount) || headerCount < 0)
    ) {
      throw new Error("headerCount must be a non-negative integer");
    }
    if (!Number.isInteger(maxHeaders) || maxHeaders < 0) {
      throw new Error("maxHeaders must be a non-negative integer");
    }
    const cannot = `Cannot build a finality proof for ${txid}`;

    const status = await this.getTransactionStatus(txid);
    const { block_height: height, block_hash: blockHash } = status;
    if (!status.confirmed || height === undefined || !blockHash) {
      throw new Error(`${cannot}: it is not confirmed.`);
    }
    const confirmations = (await this.getBlockHeight()) - height + 1;
    // Blocks after the transaction's own, as far as the tip.
    const available = Math.max(0, confirmations - 1);
    if (headerCount !== undefined && available < headerCount) {
      throw new Error(
        `${cannot}: it has ${confirmations} confirmation(s), and ${headerCount} header(s) after its block need ${
          headerCount + 1
        }.`
      );
    }

    const [tx, proof] = await Promise.all([
      this.getTransaction(txid),
      this.getMerkleBlockProof(txid),
    ]);

    const changed = `${cannot}: the pieces do not fit together. The chain may have changed while they were read; try again.`;
    // The transaction returned is the one asked for, and the proof shows it
    // in a block: the block the provider said it is in. The proof matches that
    // transaction and no other, the smallest proof there is, which also
    // satisfies a verifier that reads only the first match, as Charms does.
    let matched: string[] = [];
    try {
      matched = merkleBlockTransactions(proof);
    } catch {
      // A malformed proof matches nothing, and fails below.
    }
    if (
      transactionId(tx) !== txid.toLowerCase() ||
      matched.length !== 1 ||
      matched[0] !== txid.toLowerCase()
    ) {
      throw new Error(changed);
    }
    // A merkle block starts with the header of the block it proves against.
    const blockHeader = proof.slice(0, HEADER_HEX_LENGTH);
    if (
      blockHashOfHeader(blockHeader) !== blockHash ||
      !headerMeetsItsTarget(blockHeader)
    ) {
      throw new Error(changed);
    }

    const headers: string[] = [];
    let previous = blockHash;
    let work = workOfHeader(blockHeader);
    /** Fetch the next `count` headers, check them, and add their work. */
    const extend = async (count: number): Promise<void> => {
      const from = height + 1 + headers.length;
      const blocks = await Promise.all(
        Array.from({ length: count }, async (_, i) => {
          const hash = await this.getBlockHash(from + i);
          return { hash, header: await this.getBlockHeader(hash) };
        })
      );
      for (const { hash, header } of blocks) {
        if (
          blockHashOfHeader(header) !== hash ||
          previousBlockHashOfHeader(header) !== previous ||
          !headerMeetsItsTarget(header)
        ) {
          throw new Error(changed);
        }
        previous = hash;
        work += workOfHeader(header);
        headers.push(header);
      }
    };

    if (headerCount !== undefined) {
      await extend(headerCount);
      return { tx, proof, headers };
    }

    // No block's work says what the next one holds: difficulty changes, and a
    // test network mixes minimum-difficulty blocks with real ones. So the only
    // limits are the tip and maxHeaders, and the work is whatever the headers
    // turn out to carry.
    const limit = Math.min(available, maxHeaders);
    while (work < required && headers.length < limit) {
      // Size the batch from the last block's work, then top up. The guess only
      // saves requests; a wrong one costs another round.
      const each = workOfHeader(headers[headers.length - 1] ?? blockHeader);
      const missing = (required - work + each - 1n) / each;
      const room = Math.min(limit - headers.length, FINALITY_HEADER_BATCH);
      await extend(missing < BigInt(room) ? Number(missing) : room);
    }
    // A batch sized from a light block overshoots when heavier ones follow.
    // Return no more headers than the work needs.
    while (headers.length > 0) {
      const last = workOfHeader(headers[headers.length - 1]);
      if (work - last < required) break;
      work -= last;
      headers.pop();
    }
    if (work < required) {
      const percent = Number((work * 1000n) / required) / 10;
      const held = `its block and the ${headers.length} block(s) after it hold ${percent}% of the work required`;
      throw new Error(
        headers.length < available
          ? `${cannot}: ${held}, after ${maxHeaders} header(s), the most this call fetches.`
          : `${cannot}: ${held}. It has ${confirmations} confirmation(s); wait for more.`
      );
    }
    return { tx, proof, headers };
  }
}
