/**
 * Common TypeScript interfaces and types for btc-locker
 */

import * as bitcoin from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import { ECPairFactory } from "ecpair";

/**
 * Bitcoin key pair with private key, public key, and address
 * @interface KeyPair
 * @description Contains cryptographic key pair information for Bitcoin operations
 */
export interface KeyPair {
  /** Private key in hexadecimal format */
  privateKey: string;
  /** Public key in hexadecimal format */
  publicKey: string;
  /** Bitcoin address derived from the public key */
  address: string;
}

/**
 * Bitcoin script information and metadata
 * @interface ScriptInfo
 * @description Contains comprehensive information about Bitcoin scripts including timelock, multisig, and escrow details
 */
export interface ScriptInfo {
  /** Redeem script in hexadecimal format */
  redeemScript: string;
  /** Hash of the script */
  scriptHash: string;
  /** Bitcoin address for the script */
  address: string;
  /** Type of script (timelock, multisig, escrow, etc.) */
  type: string;
  /** Optional locktime for timelock scripts */
  locktime?: number;
  /** Optional sequence number for relative timelocks */
  sequence?: number;
  /** Single public key for basic scripts */
  publicKey?: string;
  /** Array of public keys for multisig scripts */
  publicKeys?: string[];
  /** Number of required signatures for multisig (m-of-n) */
  m?: number;
  /** Owner public key for ownership-based scripts */
  ownerPubKey?: string;
  /** Penalty public key for penalty-based scripts */
  penaltyPubKey?: string;
  /** Public key that can spend before locktime (escrow) */
  beforePublicKey?: string;
  /** Public key that can spend after locktime (escrow) */
  afterPublicKey?: string;
}

/**
 * Basic Bitcoin UTXO (Unspent Transaction Output)
 * @interface UTXO
 * @description Core UTXO fields for transaction construction
 */
export interface UTXO {
  txid: string;
  vout: number;
  value: number;
}

/**
 * Bitcoin transaction result information
 * @interface TransactionResult
 * @description Contains the essential information about a created Bitcoin transaction
 */
export interface TransactionResult {
  /** Transaction in hexadecimal format */
  hex: string;
  /** Transaction ID (hash) */
  txid: string;
  /** Transaction size in bytes */
  size: number;
  /** Transaction fee in satoshis */
  fee: number;
}

export interface MultisigConfig {
  m: number;
  publicKeys: string[];
}

export interface TimelockConfig {
  locktime: number;
  type: 'absolute' | 'relative';
}

export interface EscrowConfig {
  arbiterPubKey: string;
  buyerPubKey: string;
  sellerPubKey: string;
  locktime?: number;
}

export interface DawnStakeConfig {
  stakingPubKey: string;
  stakingAmount: number;
  locktime: number;
  penaltyPubKey?: string;
}

export interface YieldConfig {
  totalYield: number;
  recipients: Array<{
    address: string;
    percentage: number;
  }>;
}



export interface ECCLib {
  isPoint(p: Uint8Array): boolean;
  isPrivate(p: Uint8Array): boolean;
  pointFromScalar(sk: Uint8Array, compressed?: boolean): Uint8Array | null;
  [key: string]: any;
}

export interface InitializedECC {
  ecc: ECCLib;
  bip32: ReturnType<typeof BIP32Factory>;
  ECPair: ReturnType<typeof ECPairFactory>;
}