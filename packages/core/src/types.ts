/**
 * Common TypeScript interfaces and types for btc-locker
 */
import { BIP32Factory } from "bip32";
import { ECPairFactory } from "ecpair";
import { FeePriorities } from "./utils/fees.js";
import type { SundialMetadata } from "./utils/metadata.js";

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
  /** Optional scriptPubKey hex for the output being spent (required for correct BIP143 segwit sighash when sourceAddress is unavailable) */
  scriptPubKey?: string;
  /** When true, this UTXO will never be selected by selectUtxos (use for inscriptions, ordinals, or reserved outputs) */
  doNotSpend?: boolean;
}

/**
 * Base parameters shared by all transaction creation functions
 * @interface BaseTransactionParams
 * @description Provides common fields (fee priority, metadata) used across all transaction builders
 */
export interface BaseTransactionParams {
  /** Fee priority for the transaction */
  priority?: FeePriorities;
  /** Optional metadata to attach to the transaction */
  metadata?: SundialMetadata | string;
}

/**
 * Protocol fee parameters for transactions that support protocol fees
 * @interface ProtocolFeeParams
 * @description Mixin for transactions that support protocol-level fees and change outputs
 */
export interface ProtocolFeeParams {
  /** Optional fee address for protocol fees */
  feeAddress?: string;
  /** Optional protocol fee amount in satoshis (required if feeAddress is provided) */
  protocolFeeAmount?: number;
  /** Optional change address for remaining funds */
  changeAddress?: string;
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
