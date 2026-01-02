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
 */
export function getECC() {
  if (!ecc || !bip32 || !ECPair) {
    throw new Error("ECC not initialized. Call initECC() first.");
  }
  return { ecc, bip32, ECPair };
}

/**
 * Core BTCLocker class with common functionality
 */
export class BTCLockerCore {
  constructor(network = bitcoin.networks.bitcoin) {
    this.network = network;
    this.initialized = false;
  }

  /**
   * Initialize the ECC library (must be called before other methods)
   */
  async init() {
    if (!this.initialized) {
      await initECC();
      this.initialized = true;
    }
  }

  /**
   * Ensure ECC is initialized
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
