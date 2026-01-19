/**
 * Main entry point for BTC Locker library
 */

export * as bitcoin from "bitcoinjs-lib";
// Import the modular BTCLocker implementation
import BTCLocker, {
  BTCLockerCore,
  KeyPairGenerator,
  TimelockManager,
  MultisigTimelockManager,
  HodlScriptCreator,
  TransactionManager,
  YieldDistributor,
  DawnStakingManager,
} from "./locker/index";
import {
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  BTCLockerError,
  ValidationError,
  TimelockError,
} from "./utils";
import type { NetworkType } from "./types";

/**
 * Factory function to create an initialized BTCLocker instance
 * @param network - Network ('bitcoin', 'testnet', 'regtest', or network object)
 * @returns Initialized BTCLocker instance
 * @example
 * // Using string network name
 * const locker = await createBTCLocker('testnet');
 *
 * // Using network object
 * const locker = await createBTCLocker(bitcoin.networks.testnet);
 */
export async function createBTCLocker(network: NetworkType = "testnet"): Promise<BTCLocker> {
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
  DawnStakingManager,
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