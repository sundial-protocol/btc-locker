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
import BitcoinAPI from "./bitcoin-api";

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

// Export additional interfaces from individual modules
export type { 
  EscrowSpendingTransaction,
  EscrowSpendingParams,
  EscrowSpendingSigningParams
} from "./locker/escrow";

export type {
  ExtendedKeyPair
} from "./locker/keypair";

export type {
  DawnStakingResult,
  DawnStakingWithScriptResult,
  DawnStakingCalculationResult,
  DawnStakingParams,
  DawnStakingWithScriptParams,
  DawnStakingCalculationParams,
  DawnWithdrawalParams,
  DawnWithdrawalResult,
  DawnStakingSigningParams,
  DawnWithdrawalSigningParams
} from "./locker/dawn-stake";

export type {
  SpendingTransactionParams,
  FundingTransactionParams,
  TransactionOutput,
  TransactionSigningParams,
  TransactionSubmissionParams,
  SpendingTransactionSigningParams,
  FundingTransactionSigningParams
} from "./locker/transactions";

export type {
  YieldDistributionParams,
  YieldDistributionResult,
  YieldInput,
  YieldDistributionSigningParams
} from "./locker/yield";

// Export BitcoinAPI types and interfaces
export type {
  NetworkType as BitcoinNetworkType,
  ApiProvider,
  ApiUrls,
  AddressInfo,
  ApiUTXO,
  FeeEstimates,
  BroadcastResult
} from "./bitcoin-api";

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
  BitcoinAPI,
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
  BitcoinAPI,
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