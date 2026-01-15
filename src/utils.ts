/**
 * Utility functions for BTC Locker
 */

import * as bitcoin from "bitcoinjs-lib";

/**
 * Time and date utilities
 */
export class TimeUtils {
  /**
   * Convert date to Unix timestamp
   * @param date - Date object or date string
   * @returns Unix timestamp
   */
  static dateToTimestamp(date: Date | string): number {
    if (typeof date === "string") {
      date = new Date(date);
    }
    return Math.floor(date.getTime() / 1000);
  }

  /**
   * Convert Unix timestamp to Date
   * @param timestamp - Unix timestamp
   * @returns Date object
   */
  static timestampToDate(timestamp: number): Date {
    return new Date(timestamp * 1000);
  }

  /**
   * Add time duration to current timestamp
   * @param duration - Duration in seconds
   * @param baseTime - Base timestamp (optional, defaults to now)
   * @returns Future timestamp
   */
  static addDuration(duration: number, baseTime: number = Math.floor(Date.now() / 1000)): number {
    return baseTime + duration;
  }

  /**
   * Common time durations in seconds
   */
  static get DURATIONS() {
    return {
      MINUTE: 60,
      HOUR: 3600,
      DAY: 86400,
      WEEK: 604800,
      MONTH: 2592000, // 30 days
      YEAR: 31536000, // 365 days
    } as const;
  }

  /**
   * Convert blocks to approximate time duration
   * @param blocks - Number of blocks
   * @param blockTime - Average block time in seconds (default: 600 for Bitcoin)
   * @returns Duration in seconds
   */
  static blocksToSeconds(blocks: number, blockTime: number = 600): number {
    return blocks * blockTime;
  }
}

/**
 * Script validation utilities
 */
export class ScriptUtils {
  /**
   * Validate public key format
   * @param publicKey - Public key to validate
   * @returns True if valid
   */
  static isValidPublicKey(publicKey: string | Buffer): boolean {
    try {
      if (typeof publicKey === "string") {
        publicKey = Buffer.from(publicKey, "hex");
      }
      return publicKey.length === 33 || publicKey.length === 65;
    } catch {
      return false;
    }
  }

  /**
   * Validate private key format
   * @param privateKey - Private key to validate
   * @returns True if valid
   */
  static isValidPrivateKey(privateKey: string | Buffer): boolean {
    try {
      if (typeof privateKey === "string") {
        privateKey = Buffer.from(privateKey, "hex");
      }
      return privateKey.length === 32;
    } catch {
      return false;
    }
  }

  /**
   * Validate Bitcoin address
   * @param address - Bitcoin address to validate
   * @param network - Bitcoin network (optional)
   * @returns True if valid
   */
  static isValidAddress(address: string, network: bitcoin.Network = bitcoin.networks.bitcoin): boolean {
    try {
      bitcoin.address.toOutputScript(address, network);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse script hex to human-readable format
   * @param scriptHex - Script in hex format
   * @returns Human-readable script
   */
  static parseScript(scriptHex: string): string {
    const script = Buffer.from(scriptHex, "hex");
    const decompiled = bitcoin.script.decompile(script);

    if (!decompiled) {
      throw new Error("Failed to decompile script");
    }

    return decompiled
      .map((element) => {
        if (Buffer.isBuffer(element)) {
          return element.toString("hex");
        } else {
          return bitcoin.script.toASM([element]);
        }
      })
      .join(" ");
  }
}

/**
 * Transaction utilities
 */
export class TransactionUtils {
  /**
   * Estimate transaction fee
   * @param inputs - Number of inputs
   * @param outputs - Number of outputs
   * @param feeRate - Fee rate in sat/vB
   * @returns Estimated fee in satoshis
   */
  static estimateFee(inputs: number, outputs: number, feeRate: number = 10): number {
    // Rough estimation: P2SH input ~147 vB, P2PKH output ~34 vB, overhead ~10 vB
    const estimatedSize = inputs * 147 + outputs * 34 + 10;
    return Math.ceil(estimatedSize * feeRate);
  }

  /**
   * Convert satoshis to BTC
   * @param satoshis - Amount in satoshis
   * @returns Amount in BTC
   */
  static satoshisToBTC(satoshis: number): number {
    return satoshis / 100000000;
  }

  /**
   * Convert BTC to satoshis
   * @param btc - Amount in BTC
   * @returns Amount in satoshis
   */
  static btcToSatoshis(btc: number): number {
    return Math.round(btc * 100000000);
  }
}

/**
 * Error classes for better error handling
 */
export class BTCLockerError extends Error {
  public code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "BTCLockerError";
    this.code = code;
  }
}

export class ValidationError extends BTCLockerError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class TimelockError extends BTCLockerError {
  constructor(message: string) {
    super(message, "TIMELOCK_ERROR");
    this.name = "TimelockError";
  }
}