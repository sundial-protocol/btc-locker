/**
 * Main entry point for BTC Locker library
 */

const bitcoin = require("bitcoinjs-lib");
const BTCLocker = require("./btc-locker");
const {
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  BTCLockerError,
  ValidationError,
  TimelockError,
} = require("./utils");

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

const exports = {
  BTCLocker,
  createBTCLocker,
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  BTCLockerError,
  ValidationError,
  TimelockError,
};

// For CommonJS
module.exports = exports;

// For ES6 modules (if bundler supports it)
module.exports.default = exports;
