/**
 * @fileoverview Core BTCLocker initialization and utilities
 * @module locker/core
 */

import * as bitcoin from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import { ECPairFactory } from "ecpair";
import tinysecp from "@bitcoinerlab/secp256k1";

// ECC will be initialized asynchronously
let ecc = null;
let bip32 = null;
let ECPair = null;

/**
 * Initialize ECC asynchronously for browser compatibility
 * @async
 * @function initECC
 * @returns {Promise<void>} Promise that resolves when ECC is initialized
 * @throws {Error} If ECC initialization fails
 */
export async function initECC() {
  if (!ecc) {
    try {
      // Handle ES module default export
      ecc = tinysecp.default || tinysecp;

      // Validate ECC library has required methods
      if (!ecc || typeof ecc !== "object") {
        throw new Error("ECC library is not an object");
      }

      const requiredMethods = ["isPoint", "isPrivate", "pointFromScalar"];
      for (const method of requiredMethods) {
        if (typeof ecc[method] !== "function") {
          throw new Error(`ECC library missing required method: ${method}`);
        }
      }

      // Initialize bitcoinjs-lib with the ECC library
      bitcoin.initEccLib(ecc);

      bip32 = BIP32Factory(ecc);
      ECPair = ECPairFactory(ecc);

      // Validate factories
      if (!bip32 || !ECPair) {
        throw new Error("Failed to create BIP32 or ECPair factories");
      }
    } catch (error) {
      throw new Error(`Failed to initialize ECC: ${error.message}`);
    }
  }
  return { ecc, bip32, ECPair };
}

/**
 * Get the initialized ECC components
 * @function getECC
 * @returns {Object} Object containing initialized ECC components
 * @returns {Object} returns.ecc - The ECC library instance
 * @returns {Object} returns.bip32 - The BIP32 factory instance
 * @returns {Object} returns.ECPair - The ECPair factory instance
 * @throws {Error} If ECC components are not initialized
 * @example
 * const { ecc, bip32, ECPair } = getECC();
 */
export function getECC() {
  if (!ecc || !bip32 || !ECPair) {
    throw new Error("ECC not initialized. Call initECC() first.");
  }
  return { ecc, bip32, ECPair };
}

/**
 * Base class for all BTC Locker functionality
 * @class BTCLockerCore
 * @description Provides core initialization and network management for all BTC Locker components
 */
export class BTCLockerCore {
  /**
   * Create a new BTCLockerCore instance
   * @constructor
   * @param {string|Object} [network=bitcoin.networks.bitcoin] - Bitcoin network object or 'mainnet'/'testnet'
   * @example
   * const core = new BTCLockerCore(bitcoin.networks.testnet);
   * await core.init();
   */
  constructor(network = bitcoin.networks.bitcoin) {
    this.network = network;
    this.initialized = false;
  }

  /**
   * Initialize the BTCLocker with ECC library
   * @async
   * @method init
   * @returns {Promise<void>} Promise that resolves when initialization is complete
   * @throws {Error} If ECC initialization fails
   * @example
   * const locker = new BTCLockerCore();
   * await locker.init();
   */
  async init() {
    if (!this.initialized) {
      await initECC();
      this.initialized = true;
    }
  }

  /**
   * Ensure the instance is initialized, throw error if not
   * @async
   * @method ensureInitialized
   * @returns {Promise<void>} Promise that resolves if initialized
   * @throws {Error} If not initialized
   * @private
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Validate if a timelock has expired
   * @param {number} locktime - Locktime to check
   * @param {number} currentTime - Current timestamp (optional, defaults to now)
   * @returns {boolean} True if locktime has expired
   */
  isTimelockExpired(locktime, currentTime = Math.floor(Date.now() / 1000)) {
    if (locktime < 500000000) {
      // Block height locktime
      throw new Error("Block height validation requires current block height");
    }
    return currentTime >= locktime;
  }
}
