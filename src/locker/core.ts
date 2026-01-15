/**
 * @fileoverview Core BTCLocker initialization and utilities
 */

import * as bitcoin from "bitcoinjs-lib";
import { BIP32Factory, BIP32Interface } from "bip32";
import { ECPairFactory, ECPairInterface } from "ecpair";
import tinysecp from "@bitcoinerlab/secp256k1";
import type { ECCLib, InitializedECC, NetworkType } from "../types.js";

// ECC will be initialized asynchronously
let ecc: ECCLib | null = null;
let bip32: ReturnType<typeof BIP32Factory> | null = null;
let ECPair: ReturnType<typeof ECPairFactory> | null = null;

/**
 * Initialize ECC asynchronously for browser compatibility
 * @returns Promise that resolves when ECC is initialized
 * @throws If ECC initialization fails
 */
export async function initECC(): Promise<InitializedECC> {
  if (!ecc) {
    try {
      // Handle ES module default export
      ecc = (tinysecp as any).default || tinysecp;

      // Validate ECC library has required methods
      if (!ecc || typeof ecc !== "object") {
        throw new Error("ECC library is not an object");
      }

      const requiredMethods = ["isPoint", "isPrivate", "pointFromScalar"];
      for (const method of requiredMethods) {
        if (typeof (ecc as any)[method] !== "function") {
          throw new Error(`ECC library missing required method: ${method}`);
        }
      }

      // Initialize bitcoinjs-lib with the ECC library
      bitcoin.initEccLib(ecc as any);

      bip32 = BIP32Factory(ecc as any);
      ECPair = ECPairFactory(ecc as any);

      // Validate factories
      if (!bip32 || !ECPair) {
        throw new Error("Failed to create BIP32 or ECPair factories");
      }
    } catch (error) {
      throw new Error(`Failed to initialize ECC: ${(error as Error).message}`);
    }
  }
  return { ecc: ecc!, bip32: bip32!, ECPair: ECPair! };
}

/**
 * Get the initialized ECC components
 * @returns Object containing initialized ECC components
 * @throws If ECC components are not initialized
 * @example
 * const { ecc, bip32, ECPair } = getECC();
 */
export function getECC(): InitializedECC {
  if (!ecc || !bip32 || !ECPair) {
    throw new Error("ECC not initialized. Call initECC() first.");
  }
  return { ecc, bip32, ECPair };
}

export class BTCLockerCore {
  public network: bitcoin.Network;
  public initialized: boolean;

  /**
   * Create a new BTCLockerCore instance
   * @param network - Bitcoin network ('bitcoin', 'testnet', 'regtest') or network object
   * @example
   * // Using string network name
   * const core = new BTCLockerCore('testnet');
   * await core.init();
   *
   * // Using network object
   * const core = new BTCLockerCore(bitcoin.networks.testnet);
   * await core.init();
   */
  constructor(network: NetworkType = bitcoin.networks.bitcoin) {
    // Convert string network names to network objects
    if (typeof network === "string") {
      switch (network.toLowerCase()) {
        case "bitcoin":
        case "mainnet":
          this.network = bitcoin.networks.bitcoin;
          break;
        case "testnet":
          this.network = bitcoin.networks.testnet;
          break;
        case "regtest":
          this.network = bitcoin.networks.regtest;
          break;
        default:
          throw new Error(
            `Unknown network: ${network}. Use 'bitcoin', 'testnet', 'regtest', or a network object.`
          );
      }
    } else {
      this.network = network;
    }
    this.initialized = false;
  }

  /**
   * Initialize the BTCLocker with ECC library
   * @returns Promise that resolves when initialization is complete
   * @throws If ECC initialization fails
   * @example
   * const locker = new BTCLockerCore();
   * await locker.init();
   */
  async init(): Promise<void> {
    if (!this.initialized) {
      await initECC();
      this.initialized = true;
    }
  }

  /**
   * Ensure the instance is initialized, throw error if not
   * @returns Promise that resolves if initialized
   * @throws If not initialized
   */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Validate if a timelock has expired
   * @param locktime - Locktime to check
   * @param currentTime - Current timestamp (optional, defaults to now)
   * @returns True if locktime has expired
   */
  isTimelockExpired(locktime: number, currentTime: number = Math.floor(Date.now() / 1000)): boolean {
    if (locktime < 500000000) {
      // Block height locktime
      throw new Error("Block height validation requires current block height");
    }
    return currentTime >= locktime;
  }
}