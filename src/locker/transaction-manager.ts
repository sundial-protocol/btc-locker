/**
 * @fileoverview Thin facade over per-file transaction functions
 * @description Each transaction type lives in its own file under ./transactions/.
 * This class delegates to those functions, passing itself as the shared context.
 */

import { BTCLockerCore } from "./core";
import {
  createDawnStakingTransaction,
  createDawnStakingTransactionWithScript,
  calculateDawnStakingAmounts,
  createDawnWithdrawalTransaction,
  createEscrowSpendingTransaction,
  distributeYield,
  EscrowSpendingParams,
  DawnStakingCalculationParams,
  DawnStakingCalculationResult,
  DawnWithdrawalParams,
  DawnStakingParams,
  DawnStakingWithScriptParams,
  YieldDistributionParams,
} from "./transactions";

/**
 * Unified transaction manager for all btc-locker transaction types
 * @class SundialTransactionManager
 * @extends BTCLockerCore
 */
export class SundialTransactionManager extends BTCLockerCore {
  async createDawnStakingTransaction(p: DawnStakingParams) {
    await this.ensureInitialized();
    return createDawnStakingTransaction(this, p);
  }

  async createDawnStakingTransactionWithScript(p: DawnStakingWithScriptParams) {
    await this.ensureInitialized();
    return createDawnStakingTransactionWithScript(this, p);
  }

  async calculateDawnStakingAmounts(
    p: DawnStakingCalculationParams,
  ): Promise<DawnStakingCalculationResult> {
    await this.ensureInitialized();
    return calculateDawnStakingAmounts(this, p);
  }

  async createDawnWithdrawalTransaction(p: DawnWithdrawalParams) {
    await this.ensureInitialized();
    return createDawnWithdrawalTransaction(this, p);
  }

  async createEscrowSpendingTransaction(p: EscrowSpendingParams) {
    await this.ensureInitialized();
    return createEscrowSpendingTransaction(this, p);
  }

  async distributeYield(p: YieldDistributionParams) {
    await this.ensureInitialized();
    return distributeYield(this, p);
  }
}

export default SundialTransactionManager;
