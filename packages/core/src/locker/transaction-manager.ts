/**
 * @fileoverview Thin facade over per-file transaction functions
 * @description Each transaction type lives in its own file under ./transactions/.
 * This class delegates to those functions, passing itself as the shared context.
 */

import { BTCLockerCore } from "./core.js";
import {
  createDepositTransaction,
  createDepositTransactionWithScript,
  calculateDepositAmounts,
  createWithdrawalTransaction,
  createClaimTransaction,
  createDistributionTransaction,
  createSpendingTransaction,
  createFundingTransaction,
  ClaimParams,
  DepositCalculationParams,
  DepositCalculationResult,
  WithdrawalParams,
  DepositParams,
  DepositWithScriptParams,
  DistributionParams,
  SpendingTransactionParams,
  FundingTransactionParams,
} from "./transactions/index.js";

/**
 * Unified transaction manager for all btc-locker transaction types
 * @class TransactionManager
 * @extends BTCLockerCore
 */
export class TransactionManager extends BTCLockerCore {
  async createDepositTransaction(p: DepositParams) {
    await this.ensureInitialized();
    return createDepositTransaction(this, p);
  }

  async createDepositTransactionWithScript(p: DepositWithScriptParams) {
    await this.ensureInitialized();
    return createDepositTransactionWithScript(this, p);
  }

  async calculateDepositAmounts(
    p: DepositCalculationParams,
  ): Promise<DepositCalculationResult> {
    await this.ensureInitialized();
    return calculateDepositAmounts(this, p);
  }

  async createWithdrawalTransaction(p: WithdrawalParams) {
    await this.ensureInitialized();
    return createWithdrawalTransaction(this, p);
  }

  async createClaimTransaction(p: ClaimParams) {
    await this.ensureInitialized();
    return createClaimTransaction(this, p);
  }

  async createDistributionTransaction(p: DistributionParams) {
    await this.ensureInitialized();
    return createDistributionTransaction(this, p);
  }

  async createSpendingTransaction(p: SpendingTransactionParams) {
    await this.ensureInitialized();
    return createSpendingTransaction(this, p);
  }

  async createFundingTransaction(p: FundingTransactionParams) {
    await this.ensureInitialized();
    return createFundingTransaction(this, p);
  }
}

export default TransactionManager;
