/**
 * Main entry point for BTC Locker library
 */

export * as bitcoin from "bitcoinjs-lib";
// Import the modular BTCLocker implementation
import BTCLocker, {
  BTCLockerCore,
  KeyPairGenerator,
  TransactionManager,
  ScriptManager,
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
import { BTCLockerError, ValidationError, TimelockError } from "./errors";
import BitcoinAPI from "./bitcoin-api";

// Export all types and interfaces
export type {
  KeyPair,
  ScriptInfo,
  UTXO,
  TransactionResult,
  BaseTransactionParams,
  ProtocolFeeParams,
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
export type { SundialMetadata } from "./utils/metadata";

export type { ExtendedKeyPair } from "./locker/keypair";

export type {
  DepositResult,
  DepositParams,
} from "./locker/transactions/deposit/deposit";

export type {
  DepositWithScriptResult,
  DepositWithScriptParams,
} from "./locker/transactions/deposit/deposit-with-script";

export type {
  DepositCalculationParams,
  DepositCalculationResult,
} from "./locker/transactions/deposit/calculate";

export type {
  WithdrawalParams,
  WithdrawalResult,
} from "./locker/transactions/withdraw";

export type { ClaimParams, ClaimResult } from "./locker/transactions/claim";

export type {
  DistributionParams,
  DistributionResult,
} from "./locker/transactions/distribute";

export type {
  SpendingTransactionParams,
  FundingTransactionParams,
  TransactionOutput,
  TransactionSigningParams,
  TransactionSubmissionParams,
  SpendingTransactionSigningParams,
} from "./locker/transactions/generic";

// Export BitcoinAPI types and interfaces
export type {
  ApiProvider,
  ApiUrls,
  AddressInfo,
  ApiUTXO,
  FeeEstimates,
  BroadcastResult,
} from "./bitcoin-api";

import { NETWORKS } from "./utils/network";

/**
 * Factory function to create an initialized BTCLocker instance
 * @param network - Network ('bitcoin', 'testnet', 'regtest')
 * @returns Initialized BTCLocker instance
 * @example
 * // Using string network name
 * const locker = await createBTCLocker('testnet');
 */
export async function createBTCLocker(
  network: string = "testnet",
): Promise<BTCLocker> {
  const networkType = NETWORKS[network] || NETWORKS.testnet;
  const locker = new BTCLocker(networkType);
  await locker.init();
  return locker;
}

export {
  BTCLocker,
  BTCLockerCore,
  KeyPairGenerator,
  TransactionManager,
  ScriptManager,
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
  TransactionManager,
  ScriptManager,
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
