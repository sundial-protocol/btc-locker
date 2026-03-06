/**
 * Main entry point for BTC Locker library
 */

export * as bitcoin from "bitcoinjs-lib";
// Import the modular BTCLocker implementation
import BTCLocker, {
  BTCLockerCore,
  KeyPairGenerator,
  TimelockManager,
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
  MetadataUtils,
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
  TimelockConfig,
  EscrowConfig,
  DawnStakeConfig,
  YieldConfig,
  ECCLib,
  InitializedECC,
} from "./types";

// Export NetworkType from utils/network
export type { NetworkType } from "./utils/network";
export { NETWORKS } from "./utils/network";
export { FeePriorities } from "./utils/fees";
export { TxType, packMetadata, unpackMetadata } from "./utils/metadata";

// Export additional interfaces from individual modules
export type { 
  EscrowSpendingTransaction,
  EscrowSpendingParams,
  EscrowSpendingSigningParams
} from "./locker/escrow";

export type {
  SundialMetadata
} from "./utils/metadata";

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
  ApiProvider,
  ApiUrls,
  AddressInfo,
  ApiUTXO,
  FeeEstimates,
  BroadcastResult
} from "./bitcoin-api";

import { NETWORKS } from "./utils/network";

// Export the EscrowManager class
export { EscrowManager } from "./locker/escrow";

/**
 * Factory function to create an initialized BTCLocker instance
 * @param network - Network ('bitcoin', 'testnet', 'regtest')
 * @returns Initialized BTCLocker instance
 * @example
 * // Using string network name
 * const locker = await createBTCLocker('testnet');
 */
export async function createBTCLocker(network: string = "testnet"): Promise<BTCLocker> {
  const networkType = NETWORKS[network] || NETWORKS.testnet;
  const locker = new BTCLocker(networkType);
  await locker.init();
  return locker;
}

export {
  BTCLocker,
  BTCLockerCore,
  KeyPairGenerator,
  TimelockManager,
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
  MetadataUtils,
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
  MetadataUtils,
  Utils,
  BTCLockerError,
  ValidationError,
  TimelockError,
};