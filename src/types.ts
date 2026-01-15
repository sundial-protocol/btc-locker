/**
 * Common TypeScript interfaces and types for btc-locker
 */

import * as bitcoin from "bitcoinjs-lib";
import { BIP32Interface, BIP32Factory } from "bip32";
import { ECPairInterface, ECPairFactory } from "ecpair";

export interface KeyPair {
  privateKey: string;
  publicKey: string;
  address: string;
}

export interface ScriptInfo {
  redeemScript: string;
  scriptHash: string;
  address: string;
  type: string;
  locktime?: number;
  sequence?: number;
  publicKey?: string;
  publicKeys?: string[];
  m?: number;
  ownerPubKey?: string;
  penaltyPubKey?: string;
  beforePublicKey?: string;
  afterPublicKey?: string;
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  hex: string;
}

export interface TransactionResult {
  hex: string;
  txid: string;
  size: number;
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

export type NetworkType = 'bitcoin' | 'testnet' | 'regtest' | bitcoin.Network;

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