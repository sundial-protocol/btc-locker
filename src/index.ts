/**
 * Main entry point for BTC Locker library
 */

export * as bitcoin from "bitcoinjs-lib";
// Import the modular BTCLocker implementation
import BTCLocker, {
  BTCLockerCore,
  KeyPairGenerator,
  SundialTransactionManager,
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
  DawnStakingResult,
  DawnStakingParams,
} from "./locker/transactions/staking/stake";

export type {
  DawnStakingWithScriptResult,
  DawnStakingWithScriptParams,
} from "./locker/transactions/staking/stake-with-script";

export type {
  DawnStakingCalculationParams,
  DawnStakingCalculationResult,
} from "./locker/transactions/staking/calculate";

export type {
  DawnWithdrawalParams,
  DawnWithdrawalResult,
} from "./locker/transactions/user-withdrawal";

export type {
  EscrowSpendingParams,
  EscrowSpendingResult,
} from "./locker/transactions/escrow-spending";

export type {
  YieldDistributionParams,
  YieldDistributionResult,
} from "./locker/transactions/yield-distribution";

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
  SundialTransactionManager,
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
  SundialTransactionManager,
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
