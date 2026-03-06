/**
 * Common TypeScript interfaces and types for btc-locker
 */
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
 * @description Contains comprehensive information about Bitcoin scripts including timelock and escrow details
 */
export interface ScriptInfo {
  /** Redeem script in hexadecimal format */
  redeemScript: string;
  /** Hash of the script */
  scriptHash: string;
  /** Bitcoin address for the script */
  address: string;
  /** Type of script (timelock, escrow, etc.) */
  type: string;
  /** Optional locktime for timelock scripts */
  locktime?: number;
  /** Optional sequence number for relative timelocks */
  sequence?: number;
  /** Single public key for basic scripts */
  publicKey?: string;
  /** Owner public key for ownership-based scripts */
  ownerPubKey?: string;
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

export interface TimelockConfig {
  locktime: number;
  type: "absolute" | "relative";
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
}

export interface InitializedECC {
  ecc: ECCLib;
  bip32: BIP32FactoryType;
  ECPair: ECPairFactoryType;
}

export type ECPairFactoryType = ReturnType<typeof ECPairFactory>;
export type BIP32FactoryType = ReturnType<typeof BIP32Factory>;

export interface PsbtInputData {
  partialSig?: Array<{
    signature: Buffer;
    pubkey: Buffer;
  }>;
  redeemScript?: Buffer;
  witnessScript?: Buffer;
  witnessUtxo?: {
    value: number;
    script: Buffer;
  };
  nonWitnessUtxo?: Buffer;
  sighashType?: number;
}
