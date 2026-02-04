/**
 * TypeScript definitions for btc-locker
 */

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
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
}

export interface TransactionResult {
  hex: string;
  txid: string;
  size: number;
  fee: number;
}

export declare class BTCLocker {
  constructor(network?: any);

  createTimelockScript(
    locktime: number,
    publicKey: string | Buffer
  ): ScriptInfo;
  createRelativeTimelockScript(
    sequence: number,
    publicKey: string | Buffer
  ): ScriptInfo;
  createSpendingTransaction(
    scriptInfo: ScriptInfo,
    utxos: UTXO[],
    destinationAddress: string,
    fee: number,
    privateKeys: (string | Buffer)[]
  ): TransactionResult;
  isTimelockExpired(locktime: number, currentTime?: number): boolean;
  generateKeyPair(): KeyPair;
}

export declare class TimeUtils {
  static dateToTimestamp(date: Date | string): number;
  static timestampToDate(timestamp: number): Date;
  static addDuration(duration: number, baseTime?: number): number;
  static readonly DURATIONS: {
    MINUTE: number;
    HOUR: number;
    DAY: number;
    WEEK: number;
    MONTH: number;
    YEAR: number;
  };
  static blocksToSeconds(blocks: number, blockTime?: number): number;
}

export declare class ScriptUtils {
  static isValidPublicKey(publicKey: string | Buffer): boolean;
  static isValidPrivateKey(privateKey: string | Buffer): boolean;
  static isValidAddress(address: string, network?: any): boolean;
  static parseScript(scriptHex: string): string;
}

export declare class TransactionUtils {
  static estimateFee(inputs: number, outputs: number, feeRate?: number): number;
  static satoshisToBTC(satoshis: number): number;
  static btcToSatoshis(btc: number): number;
}

export declare class BTCLockerError extends Error {
  code: string;
  constructor(message: string, code: string);
}

export declare class ValidationError extends BTCLockerError {
  constructor(message: string);
}

export declare class TimelockError extends BTCLockerError {
  constructor(message: string);
}
