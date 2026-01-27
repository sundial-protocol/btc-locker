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
  KeyUtils,
  FeeUtils,
  ValidationUtils,
  Utils,
} from "./utils";
import {
  BTCLockerError,
  ValidationError,
  TimelockError,
} from "./errors";

// Export all types and interfaces
export type {
  KeyPair,
  ScriptInfo,
  UTXO,
  TransactionResult,
  MultisigConfig,
  TimelockConfig,
  EscrowConfig,
  DawnStakeConfig,
  YieldConfig,
  NetworkType,
  ECCLib,
  InitializedECC,
} from "./types";

export type {
  SpendingTransactionParams,
  FundingTransactionParams,
  YieldDistributionParams,
  YieldDistributionResult,
  DawnStakingParams,
  DawnStakingWithScriptParams,
  DawnStakingCalculationParams,
  DawnWithdrawalParams,
  DawnWithdrawalResult,
} from "./locker/index";

// Export additional interfaces from individual modules
export type { 
  EscrowSpendingTransaction 
} from "./locker/escrow";

export type {
  ExtendedKeyPair
} from "./locker/keypair";

export type {
  DawnStakingResult,
  DawnStakingWithScriptResult,
  DawnStakingCalculationResult,
  DawnStakingParams as DawnStakingParamsLocal,
  DawnStakingWithScriptParams as DawnStakingWithScriptParamsLocal,
  DawnStakingCalculationParams as DawnStakingCalculationParamsLocal,
  DawnWithdrawalParams as DawnWithdrawalParamsLocal,
  DawnWithdrawalResult as DawnWithdrawalResultLocal,
  DawnStakingInput,
  DawnWithdrawalInput
} from "./locker/dawn-stake";

export type {
  SpendingTransactionParams as SpendingTransactionParamsLocal,
  FundingTransactionParams as FundingTransactionParamsLocal,
  TransactionOutput
} from "./locker/transactions";

export type {
  YieldDistributionParams as YieldDistributionParamsLocal,
  YieldDistributionResult as YieldDistributionResultLocal,
  YieldInput
} from "./locker/yield";

// Import NetworkType for use in function
import type { NetworkType } from "./types";

// Export the EscrowManager class
export { EscrowManager } from "./locker/escrow";

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
  KeyUtils,
  FeeUtils,
  ValidationUtils,
  Utils,
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
  KeyUtils,
  FeeUtils,
  ValidationUtils,
  Utils,
  BTCLockerError,
  ValidationError,
  TimelockError,
};