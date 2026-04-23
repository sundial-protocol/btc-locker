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
} from "./locker/index.js";
import {
  TimeUtils,
  ScriptUtils,
  TransactionUtils,
  KeyUtils,
  FeeUtils,
  ValidationUtils,
  MetadataUtils,
  Utils,
} from "./utils/index.js";
import { BTCLockerError, ValidationError, TimelockError } from "./errors.js";
import BitcoinAPI from "./bitcoin-api.js";

// Export all types and interfaces
export type {
  KeyPair,
  ScriptInfo,
  UTXO,
  BaseTransactionParams,
  ProtocolFeeParams,
  TimelockConfig,
  EscrowConfig,
  DawnStakeConfig,
  YieldConfig,
  ECCLib,
  InitializedECC,
} from "./types.js";

// Export NetworkType from utils/network
export type { NetworkType } from "./utils/network.js";
export { NETWORKS } from "./utils/network.js";
export { FeePriorities } from "./utils/fees.js";
export { TxType, packMetadata, unpackMetadata } from "./utils/metadata.js";

// Export additional interfaces from individual modules
export type { SundialMetadata } from "./utils/metadata.js";

export type { DepositParams } from "./locker/transactions/deposit/deposit.js";

export type { DepositWithScriptParams } from "./locker/transactions/deposit/deposit-with-script.js";

export type { DepositCalculationParams } from "./locker/transactions/deposit/calculate.js";

export type { WithdrawalParams } from "./locker/transactions/withdraw.js";

export type { ClaimParams } from "./locker/transactions/claim.js";

export type { DistributionParams } from "./locker/transactions/distribute.js";

export type {
  SpendingTransactionParams,
  FundingTransactionParams,
  TransactionOutput,
  TransactionSigningParams,
  TransactionSubmissionParams,
  SpendingTransactionSigningParams,
} from "./locker/transactions/generic.js";

// Export BitcoinAPI types and interfaces
export type {
  ApiProvider,
  ApiUrls,
  AddressInfo,
  ApiUTXO,
  FeeEstimates,
  BroadcastResult,
} from "./bitcoin-api.js";

import { NETWORKS } from "./utils/network.js";

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
