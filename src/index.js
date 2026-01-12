/**
 * Main entry point for BTC Locker library
 */

import * as bitcoin from "bitcoinjs-lib";
// Import the modular BTCLocker implementation
import BTCLocker from "./locker/index.js";
import {
  BTCLockerCore,
  KeyPairGenerator,
  TimelockManager,
  MultisigTimelockManager,
  HodlScriptCreator,
  TransactionManager,
  YieldDistributor,
  DawnStakingManager,
} from "./locker/index.js";
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
 * @param {string|Object} network - Network ('bitcoin', 'testnet', 'regtest', or network object)
 * @returns {Promise<BTCLocker>} Initialized BTCLocker instance
 * @example
 * // Using string network name
 * const locker = await createBTCLocker('testnet');
 *
 * // Using network object
 * const locker = await createBTCLocker(bitcoin.networks.testnet);
 */
async function createBTCLocker(network = "testnet") {
  const locker = new BTCLocker(network);
  await locker.init();
  return locker;
}

export {
  BTCLocker,
  BTCLockerCore,
  KeyPairGenerator,
  TimelockManager,
  MultisigTimelockManager,
  HodlScriptCreator,
  TransactionManager,
  YieldDistributor,
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
  BTCLockerCore,
  KeyPairGenerator,
  TimelockManager,
  MultisigTimelockManager,
  HodlScriptCreator,
  TransactionManager,
  YieldDistributor,
  DawnStakingManager,
  createBTCLocker,
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  BTCLockerError,
  ValidationError,
  TimelockError,
};
