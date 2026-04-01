/**
 * Shared types for the Bitcoin REST client.
 */

import type { UTXO } from "../types.js";
import type { NetworkType } from "../utils/network.js";

// ---------------------------------------------------------------------------
// REST API types
// ---------------------------------------------------------------------------

/** UTXO augmented with confirmation status from a REST API response. */
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

// ---------------------------------------------------------------------------
// Block / transaction types (shared data shapes)
// ---------------------------------------------------------------------------

export type BitcoinRpcScriptPubKey = {
  asm?: string;
  hex?: string;
  address?: string;
  addresses?: string[];
};

export type BitcoinRpcVout = {
  n: number;
  /** Output value in BTC. */
  value?: number;
  /** Output value in satoshis. */
  valueSats?: number;
  scriptPubKey: BitcoinRpcScriptPubKey;
};

export type BitcoinRpcTransaction = {
  txid: string;
  vout: BitcoinRpcVout[];
};

export type BitcoinRpcBlock = {
  hash: string;
  height: number;
  time?: number;
  mediantime?: number;
  previousblockhash?: string;
  tx: BitcoinRpcTransaction[];
};

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface BitcoinClientOptions {
  /** Bitcoin network ("bitcoin" | "testnet"). */
  network: NetworkType;
  /** Which public REST provider to query first (default: "mempool"). */
  apiProvider?: ApiProvider;
}
