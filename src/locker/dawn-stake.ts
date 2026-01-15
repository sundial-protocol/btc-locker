/**
 * @fileoverview Dawn Protocol staking functionality
 * @description Create transactions for Dawn protocol staking with dual outputs:
 * configurable amount to escrow script and configurable amount to timelock script
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core.js";
import type { UTXO, ScriptInfo } from "../types.js";

interface DawnStakingInput extends UTXO {
  txid: string;
  vout: number;
  value: number;
}

interface DawnStakingParams {
  inputs: DawnStakingInput[];
  escrowAddress: string;
  escrowAmount: number;
  timelockAddress: string;
  timelockAmount: number;
  changeAddress?: string;
  privateKey: string;
  feeRate?: number;
}

interface DawnStakingResult {
  hex: string;
  txid: string;
  size: number;
  fee: number;
  outputs: {
    escrowAmount: number;
    timelockAmount: number;
    changeAmount?: number;
  };
}

interface DawnStakingWithScriptParams extends Omit<DawnStakingParams, 'timelockAddress'> {
  timelockScript: ScriptInfo;
}

interface DawnStakingWithScriptResult extends DawnStakingResult {
  timelockScript: {
    address: string;
    type: string;
    locktime?: number;
  };
}

interface DawnStakingCalculationParams {
  inputs: Array<{ value: number }>;
  desiredEscrowAmount: number;
  desiredTimelockAmount: number;
  includeChange?: boolean;
  feeRate?: number;
}

interface DawnStakingCalculationResult {
  totalInputValue: number;
  estimatedFee: number;
  totalRequired: number;
  changeAmount: number;
  feasible: boolean;
  recommendation?: string;
}

/**
 * Dawn Protocol staking manager class
 * @class DawnStakingManager
 * @description Creates Bitcoin transactions for Dawn protocol staking that send funds
 * to two destinations in a single transaction: escrow script and configurable timelock script
 */
export class DawnStakingManager extends BTCLockerCore {
  /**
   * Create a Dawn staking transaction
   * @async
   * @param params - Dawn staking parameters
   * @returns Dawn staking transaction details
   * @throws If insufficient funds or invalid parameters
   * @example
   * const dawn = new DawnStakingManager();
   * const tx = await dawn.createDawnStakingTransaction({
   *   inputs: [{ txid: '...', vout: 0, value: 500000 }],
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockAddress: '3XYZ789...',
   *   timelockAmount: 200000,
   *   privateKey: '...'
   * });
   */
  async createDawnStakingTransaction(params: DawnStakingParams): Promise<DawnStakingResult> {
    await this.ensureInitialized();
    const { ECPair } = getECC();
    const {
      inputs,
      escrowAddress,
      escrowAmount,
      timelockAddress,
      timelockAmount,
      changeAddress,
      privateKey,
      feeRate = 10,
    } = params;

    // Validate parameters
    if (!inputs || !Array.isArray(inputs) || inputs.length === 0) {
      throw new Error("inputs must be a non-empty array");
    }

    if (typeof escrowAddress !== "string") {
      throw new Error("escrowAddress must be a string");
    }

    if (!Number.isInteger(escrowAmount) || escrowAmount <= 0) {
      throw new Error("escrowAmount must be a positive integer");
    }

    if (typeof timelockAddress !== "string") {
      throw new Error("timelockAddress must be a string");
    }

    if (!Number.isInteger(timelockAmount) || timelockAmount <= 0) {
      throw new Error("timelockAmount must be a positive integer");
    }

    if (typeof privateKey !== "string") {
      throw new Error("privateKey must be a hex string");
    }

    // Calculate total input value
    const totalInputValue = inputs.reduce((sum, input) => {
      if (!Number.isInteger(input.value) || input.value <= 0) {
        throw new Error("All input values must be positive integers");
      }
      return sum + input.value;
    }, 0);

    // Determine number of outputs (2 required + 1 optional change)
    const outputCount = changeAddress ? 3 : 2;
    
    // Estimate transaction size for fee calculation
    // Base size + (inputs * 148) + (outputs * 34) + some overhead
    const estimatedSize = 10 + inputs.length * 148 + outputCount * 34 + 20;
    const estimatedFee = estimatedSize * feeRate;

    // Calculate total required amount
    const totalRequiredAmount = escrowAmount + timelockAmount + estimatedFee;
    const changeAmount = totalInputValue - totalRequiredAmount;

    if (changeAmount < 0) {
      throw new Error(
        `Insufficient funds. Total: ${totalInputValue}, Required: ${totalRequiredAmount} (Escrow: ${escrowAmount}, Timelock: ${timelockAmount}, Fee: ${estimatedFee}), Shortage: ${Math.abs(changeAmount)}`
      );
    }

    // Minimum output amount (dust threshold)
    const dustThreshold = 546;
    
    if (escrowAmount < dustThreshold) {
      throw new Error(
        `Escrow amount ${escrowAmount} is below dust threshold ${dustThreshold}`
      );
    }

    if (timelockAmount < dustThreshold) {
      throw new Error(
        `Timelock amount ${timelockAmount} is below dust threshold ${dustThreshold}`
      );
    }

    // Check if change is above dust threshold if change address provided
    if (changeAddress && changeAmount > 0 && changeAmount < dustThreshold) {
      throw new Error(
        `Change amount ${changeAmount} is below dust threshold ${dustThreshold}. Either increase inputs or remove change address.`
      );
    }

    try {
      // Create key pair for signing
      const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, "hex"), {
        network: this.network,
      });

      // Create PSBT for transaction construction
      const psbt = new bitcoin.Psbt({ network: this.network });

      // Add inputs
      for (const input of inputs) {
        const inputData = {
          hash: input.txid,
          index: input.vout,
          witnessUtxo: {
            script: bitcoin.payments.p2wpkh({
              pubkey: keyPair.publicKey,
              network: this.network,
            }).output!,
            value: BigInt(input.value),
          },
        };

        psbt.addInput(inputData);
      }

      // Add outputs
      // 1. Escrow output
      psbt.addOutput({
        address: escrowAddress,
        value: BigInt(escrowAmount),
      });

      // 2. Timelock output
      psbt.addOutput({
        address: timelockAddress,
        value: BigInt(timelockAmount),
      });

      // 3. Change output (if specified and above dust threshold)
      if (changeAddress && changeAmount >= dustThreshold) {
        psbt.addOutput({
          address: changeAddress,
          value: BigInt(changeAmount),
        });
      }

      // Sign all inputs
      for (let i = 0; i < inputs.length; i++) {
        try {
          psbt.signInput(i, keyPair);
        } catch (error) {
          throw new Error(`Failed to sign input ${i}: ${(error as Error).message}`);
        }
      }

      // Finalize and extract transaction
      psbt.finalizeAllInputs();
      const transaction = psbt.extractTransaction();

      // Calculate actual fee
      const actualChangeAmount = changeAddress && changeAmount >= dustThreshold ? changeAmount : 0;
      const actualFee = totalInputValue - escrowAmount - timelockAmount - actualChangeAmount;

      const result: DawnStakingResult = {
        hex: transaction.toHex(),
        txid: transaction.getId(),
        size: transaction.byteLength(),
        fee: actualFee,
        outputs: {
          escrowAmount,
          timelockAmount,
        },
      };

      // Add change amount if it exists
      if (actualChangeAmount > 0) {
        result.outputs.changeAmount = actualChangeAmount;
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to create Dawn staking transaction: ${(error as Error).message}`);
    }
  }

  /**
   * Create a Dawn staking transaction using timelock script data
   * @async
   * @param params - Dawn staking parameters with script data
   * @returns Dawn staking transaction details with script info
   * @example
   * const timelockScript = await locker.createTimelockScript(locktime, publicKey);
   * const tx = await dawn.createDawnStakingTransactionWithScript({
   *   inputs: [{ txid: '...', vout: 0, value: 500000 }],
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockScript: timelockScript,
   *   timelockAmount: 200000,
   *   privateKey: '...'
   * });
   */
  async createDawnStakingTransactionWithScript(params: DawnStakingWithScriptParams): Promise<DawnStakingWithScriptResult> {
    const { timelockScript, ...otherParams } = params;
    
    // Validate timelock script
    if (!timelockScript || typeof timelockScript !== 'object') {
      throw new Error("timelockScript must be a valid script object");
    }
    
    if (!timelockScript.address) {
      throw new Error("timelockScript must have an address property");
    }

    // Use the timelock script address
    const txParams: DawnStakingParams = {
      ...otherParams,
      timelockAddress: timelockScript.address
    };

    const result = await this.createDawnStakingTransaction(txParams);

    // Add script information to the result
    return {
      ...result,
      timelockScript: {
        address: timelockScript.address,
        type: timelockScript.type || 'unknown',
        locktime: timelockScript.locktime,
      },
    };
  }

  /**
   * Calculate optimal amounts for Dawn staking with both outputs
   * @async
   * @param params - Calculation parameters
   * @returns Calculation results
   * @example
   * const calculation = await dawn.calculateDawnStakingAmounts({
   *   inputs: [{ value: 500000 }],
   *   desiredEscrowAmount: 100000,
   *   desiredTimelockAmount: 200000
   * });
   */
  async calculateDawnStakingAmounts(params: DawnStakingCalculationParams): Promise<DawnStakingCalculationResult> {
    const {
      inputs,
      desiredEscrowAmount,
      desiredTimelockAmount,
      includeChange = false,
      feeRate = 10,
    } = params;

    if (!inputs || !Array.isArray(inputs)) {
      throw new Error("inputs must be an array");
    }

    if (!Number.isInteger(desiredEscrowAmount) || desiredEscrowAmount <= 0) {
      throw new Error("desiredEscrowAmount must be a positive integer");
    }

    if (!Number.isInteger(desiredTimelockAmount) || desiredTimelockAmount <= 0) {
      throw new Error("desiredTimelockAmount must be a positive integer");
    }

    // Calculate total input value
    const totalInputValue = inputs.reduce((sum, input) => sum + input.value, 0);

    // Estimate transaction size (2 or 3 outputs)
    const outputCount = includeChange ? 3 : 2;
    const estimatedSize = 10 + inputs.length * 148 + outputCount * 34 + 20;
    const estimatedFee = estimatedSize * feeRate;

    const dustThreshold = 546;
    const totalRequired = desiredEscrowAmount + desiredTimelockAmount + estimatedFee;
    const changeAmount = totalInputValue - totalRequired;

    let feasible = true;
    let recommendation = "";

    // Check if amounts meet dust threshold
    if (desiredEscrowAmount < dustThreshold) {
      feasible = false;
      recommendation += `Escrow amount ${desiredEscrowAmount} below dust threshold ${dustThreshold}. `;
    }

    if (desiredTimelockAmount < dustThreshold) {
      feasible = false;
      recommendation += `Timelock amount ${desiredTimelockAmount} below dust threshold ${dustThreshold}. `;
    }

    // Check if sufficient funds
    if (changeAmount < 0) {
      feasible = false;
      recommendation += `Insufficient funds: need ${totalRequired}, have ${totalInputValue}, shortage ${Math.abs(changeAmount)}. `;
    }

    // Check change dust threshold if including change
    if (includeChange && changeAmount > 0 && changeAmount < dustThreshold) {
      feasible = false;
      recommendation += `Change amount ${changeAmount} below dust threshold. `;
    }

    return {
      totalInputValue,
      estimatedFee,
      totalRequired,
      changeAmount: Math.max(0, changeAmount),
      feasible,
      recommendation: recommendation.trim() || undefined,
    };
  }
}

export default DawnStakingManager;