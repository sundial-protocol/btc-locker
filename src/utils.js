/**
 * Utility functions for BTC Locker
 */

const bitcoin = require("bitcoinjs-lib");

/**
 * Time and date utilities
 */
class TimeUtils {
  /**
   * Convert date to Unix timestamp
   * @param {Date|string} date - Date object or date string
   * @returns {number} Unix timestamp
   */
  static dateToTimestamp(date) {
    if (typeof date === "string") {
      date = new Date(date);
    }
    return Math.floor(date.getTime() / 1000);
  }

  /**
   * Convert Unix timestamp to Date
   * @param {number} timestamp - Unix timestamp
   * @returns {Date} Date object
   */
  static timestampToDate(timestamp) {
    return new Date(timestamp * 1000);
  }

  /**
   * Add time duration to current timestamp
   * @param {number} duration - Duration in seconds
   * @param {number} baseTime - Base timestamp (optional, defaults to now)
   * @returns {number} Future timestamp
   */
  static addDuration(duration, baseTime = Math.floor(Date.now() / 1000)) {
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
    };
  }

  /**
   * Convert blocks to approximate time duration
   * @param {number} blocks - Number of blocks
   * @param {number} blockTime - Average block time in seconds (default: 600 for Bitcoin)
   * @returns {number} Duration in seconds
   */
  static blocksToSeconds(blocks, blockTime = 600) {
    return blocks * blockTime;
  }
}

/**
 * Script validation utilities
 */
class ScriptUtils {
  /**
   * Validate public key format
   * @param {string|Buffer} publicKey - Public key to validate
   * @returns {boolean} True if valid
   */
  static isValidPublicKey(publicKey) {
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
   * @param {string|Buffer} privateKey - Private key to validate
   * @returns {boolean} True if valid
   */
  static isValidPrivateKey(privateKey) {
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
   * @param {string} address - Bitcoin address to validate
   * @param {Object} network - Bitcoin network (optional)
   * @returns {boolean} True if valid
   */
  static isValidAddress(address, network = bitcoin.networks.bitcoin) {
    try {
      bitcoin.address.toOutputScript(address, network);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse script hex to human-readable format
   * @param {string} scriptHex - Script in hex format
   * @returns {string} Human-readable script
   */
  static parseScript(scriptHex) {
    const script = Buffer.from(scriptHex, "hex");
    const decompiled = bitcoin.script.decompile(script);

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
class TransactionUtils {
  /**
   * Estimate transaction fee
   * @param {number} inputs - Number of inputs
   * @param {number} outputs - Number of outputs
   * @param {number} feeRate - Fee rate in sat/vB
   * @returns {number} Estimated fee in satoshis
   */
  static estimateFee(inputs, outputs, feeRate = 10) {
    // Rough estimation: P2SH input ~147 vB, P2PKH output ~34 vB, overhead ~10 vB
    const estimatedSize = inputs * 147 + outputs * 34 + 10;
    return Math.ceil(estimatedSize * feeRate);
  }

  /**
   * Convert satoshis to BTC
   * @param {number} satoshis - Amount in satoshis
   * @returns {number} Amount in BTC
   */
  static satoshisToBTC(satoshis) {
    return satoshis / 100000000;
  }

  /**
   * Convert BTC to satoshis
   * @param {number} btc - Amount in BTC
   * @returns {number} Amount in satoshis
   */
  static btcToSatoshis(btc) {
    return Math.round(btc * 100000000);
  }
}

/**
 * Error classes for better error handling
 */
class BTCLockerError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "BTCLockerError";
    this.code = code;
  }
}

class ValidationError extends BTCLockerError {
  constructor(message) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

class TimelockError extends BTCLockerError {
  constructor(message) {
    super(message, "TIMELOCK_ERROR");
    this.name = "TimelockError";
  }
}

module.exports = {
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  BTCLockerError,
  ValidationError,
  TimelockError,
};
