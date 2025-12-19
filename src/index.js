/**
 * Main entry point for BTC Locker library
 */

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
  const locker = new BTCLocker(network);
  await locker.init();
  return locker;
}

module.exports = {
  BTCLocker,
  createBTCLocker,
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  BTCLockerError,
  ValidationError,
  TimelockError,
};
