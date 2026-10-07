import type { Network } from "bitcoinjs-lib";
import type { ECPairInterface } from "ecpair";

export declare const NETWORK: Network;
export declare const RPC_URL: string;

/** Call a Bitcoin Core RPC method. */
export declare function rpc<T = unknown>(method: string, ...params: unknown[]): Promise<T>;

export interface Party {
  /** The label the key was derived from. */
  name: string;
  key: ECPairInterface;
  privateKeyHex: string;
  /** Compressed public key, hex. */
  publicKeyHex: string;
  /** P2WPKH address. */
  address: string;
  /** P2WPKH scriptPubKey, hex. */
  scriptHex: string;
  /** x-only public key, for taproot. */
  xOnly: Buffer;
}

/** A party with a key derived from its label, so runs are reproducible. */
export declare function party(label: string): Party;

/** An unspent output. Structurally the same as btc-locker's `UTXO`. */
export interface Utxo {
  txid: string;
  vout: number;
  /** Satoshis. */
  value: number;
  scriptPubKey: string;
}

/** Mine `blocks` blocks, paying the coinbase to `to`. Returns the new height. */
export declare function mine(blocks: number, to: { address: string }): Promise<number>;

/** Unspent outputs of an address, oldest first. Confirmed outputs only. */
export declare function utxosOf(address: string): Promise<Utxo[]>;

/** Height of the block that confirmed `txid`. */
export declare function heightOf(txid: string): Promise<number>;

/** Median time past of the tip. */
export declare function medianTime(): Promise<number>;

export interface MempoolAccept {
  allowed: boolean;
  /** bitcoind's reject reason, when not allowed. */
  reason?: string;
  vsize?: number;
  /** Satoshis. */
  fee?: number;
}

/** Whether bitcoind would accept a signed transaction, without broadcasting it. */
export declare function mempoolAccept(hex: string): Promise<MempoolAccept>;

/** Broadcast a signed transaction. Returns the txid. */
export declare function broadcast(hex: string): Promise<string>;

/** Sign every input with whichever of `signers` owns it, finalize, broadcast. */
export declare function signAndBroadcast(psbtBase64: string, signers: Party[]): Promise<string>;

export interface ApiUtxo extends Utxo {
  status: { confirmed: boolean; block_height?: number };
}

/** Esplora-style chain API served from bitcoind. */
export declare const esploraOverRpc: {
  getAddressUtxos(address: string): Promise<ApiUtxo[]>;
  fetchConfirmedUtxos(address: string): Promise<ApiUtxo[]>;
  getTransaction(txid: string): Promise<string>;
  getBlockHeight(): Promise<number>;
  broadcastTransaction(hex: string): Promise<{ txid: string }>;
  makeRequest(endpoint: string): Promise<{ confirmed: boolean; block_height?: number }>;
};
