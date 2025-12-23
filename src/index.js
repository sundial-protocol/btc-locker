/**
 * Main entry point for BTC Locker library
 */

import * as bitcoin from "bitcoinjs-lib";
import BTCLocker from "./btc-locker.js";
import {
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  BTCLockerError,
  ValidationError,
  TimelockError,
} from "./utils.js";

/**
 * Factory function to create an initialized BTCLocker instance
 * @param {string|Object} network - Network ('bitcoin', 'testnet', or network object)
 * @returns {Promise<BTCLocker>} Initialized BTCLocker instance
 */
async function createBTCLocker(network = "testnet") {
  // Convert string network names to network objects
  let networkObj;
  if (typeof network === "string") {
    switch (network.toLowerCase()) {
      case "bitcoin":
      case "mainnet":
        networkObj = bitcoin.networks.bitcoin;
        break;
      case "testnet":
        networkObj = bitcoin.networks.testnet;
        break;
      case "regtest":
        networkObj = bitcoin.networks.regtest;
        break;
      default:
        throw new Error(`Unknown network: ${network}`);
    }
  } else {
    networkObj = network;
  }
  
  const locker = new BTCLocker(networkObj);
  await locker.init();
  return locker;
}

export {
  BTCLocker,
  createBTCLocker,
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  BTCLockerError,
  ValidationError,
  TimelockError,
};

// Default export
export default {
  BTCLocker,
  createBTCLocker,
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  BTCLockerError,
  ValidationError,
  TimelockError,
};
