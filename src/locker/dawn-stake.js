/**
 * @fileoverview Dawn Protocol staking functionality
 * @description Create transactions for Dawn protocol staking with dual outputs:
 * configurable amount to escrow script and configurable amount to timelock script
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core.js";

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
   * @param {Object} params - Dawn staking parameters
   * @param {Array<Object>} params.inputs - Input UTXOs to spend from
   * @param {string} params.inputs[].txid - Transaction ID of the UTXO
   * @param {number} params.inputs[].vout - Output index of the UTXO
   * @param {number} params.inputs[].value - Value in satoshis
   * @param {string} params.escrowAddress - Address of the escrow script
   * @param {number} params.escrowAmount - Amount to send to escrow (satoshis)
   * @param {string} params.timelockAddress - Address of the configurable timelock script
   * @param {number} params.timelockAmount - Amount to send to timelock script (satoshis)
   * @param {string} [params.changeAddress] - Address for change (optional)
   * @param {string} params.privateKey - Private key for signing inputs (hex format)
   * @param {number} [params.feeRate=10] - Fee rate in sat/byte
   * @returns {Promise<Object>} Dawn staking transaction details
   * @returns {string} returns.hex - Signed transaction hex
   * @returns {string} returns.txid - Transaction ID
   * @returns {number} returns.size - Transaction size in bytes
   * @returns {number} returns.fee - Transaction fee in satoshis
   * @returns {Object} returns.outputs - Output breakdown
   * @returns {number} returns.outputs.escrowAmount - Amount sent to escrow
   * @returns {number} returns.outputs.timelockAmount - Amount sent to timelock script
   * @returns {number} [returns.outputs.changeAmount] - Amount sent to change address (if any)
   * @throws {Error} If insufficient funds or invalid parameters
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
  async createDawnStakingTransaction(params) {
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
            }).output,
            value: input.value,
          },
        };

        psbt.addInput(inputData);
      }

      // Add outputs
      // 1. Escrow output
      psbt.addOutput({
        address: escrowAddress,
        value: escrowAmount,
      });

      // 2. Timelock output
      psbt.addOutput({
        address: timelockAddress,
        value: timelockAmount,
      });

      // 3. Change output (if specified and above dust threshold)
      if (changeAddress && changeAmount >= dustThreshold) {
        psbt.addOutput({
          address: changeAddress,
          value: changeAmount,
        });
      }

      // Sign all inputs
      for (let i = 0; i < inputs.length; i++) {
        try {
          psbt.signInput(i, keyPair);
        } catch (error) {
          throw new Error(`Failed to sign input ${i}: ${error.message}`);
        }
      }

      // Finalize and extract transaction
      psbt.finalizeAllInputs();
      const transaction = psbt.extractTransaction();

      // Calculate actual fee
      const actualChangeAmount = changeAddress && changeAmount >= dustThreshold ? changeAmount : 0;
      const actualFee = totalInputValue - escrowAmount - timelockAmount - actualChangeAmount;

      const result = {
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
      throw new Error(`Failed to create Dawn staking transaction: ${error.message}`);
    }
  }

  /**
   * Create a Dawn staking transaction using timelock script data
   * @async
   * @param {Object} params - Dawn staking parameters with script data
   * @param {Array<Object>} params.inputs - Input UTXOs to spend from
   * @param {string} params.inputs[].txid - Transaction ID of the UTXO
   * @param {number} params.inputs[].vout - Output index of the UTXO
   * @param {number} params.inputs[].value - Value in satoshis
   * @param {string} params.escrowAddress - Address of the escrow script
   * @param {number} params.escrowAmount - Amount to send to escrow (satoshis)
   * @param {Object} params.timelockScript - Timelock script data object
   * @param {string} params.timelockScript.address - Address of the timelock script
   * @param {number} params.timelockScript.locktime - Locktime of the script
   * @param {string} params.timelockScript.type - Type of timelock script
   * @param {number} params.timelockAmount - Amount to send to timelock script (satoshis)
   * @param {string} [params.changeAddress] - Address for change (optional)
   * @param {string} params.privateKey - Private key for signing inputs (hex format)
   * @param {number} [params.feeRate=10] - Fee rate in sat/byte
   * @returns {Promise<Object>} Dawn staking transaction details with script info
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
  async createDawnStakingTransactionWithScript(params) {
    const { timelockScript, ...otherParams } = params;
    
    // Validate timelock script
    if (!timelockScript || typeof timelockScript !== 'object') {
      throw new Error("timelockScript must be a valid script object");
    }
    
    if (!timelockScript.address) {
      throw new Error("timelockScript must have an address property");
    }

    // Use the timelock script address
    const txParams = {
      ...otherParams,
      timelockAddress: timelockScript.address
    };

    const result = await this.createDawnStakingTransaction(txParams);

    // Add script information to the result
    result.timelockScript = {
      address: timelockScript.address,
      type: timelockScript.type || 'unknown',
      locktime: timelockScript.locktime,
    };

    return result;
  }

  /**
   * Calculate optimal amounts for Dawn staking with both outputs
   * @async
   * @param {Object} params - Calculation parameters
   * @param {Array<Object>} params.inputs - Input UTXOs
   * @param {number} params.inputs[].value - UTXO value in satoshis
   * @param {number} params.desiredEscrowAmount - Desired escrow amount
   * @param {number} params.desiredTimelockAmount - Desired timelock amount
   * @param {boolean} [params.includeChange=false] - Whether to include change output
   * @param {number} [params.feeRate=10] - Fee rate in sat/byte
   * @returns {Promise<Object>} Calculation results
   * @returns {number} returns.totalInputValue - Total input value
   * @returns {number} returns.estimatedFee - Estimated transaction fee
   * @returns {number} returns.totalRequired - Total amount required
   * @returns {number} returns.changeAmount - Change amount (if any)
   * @returns {boolean} returns.feasible - Whether transaction is feasible
   * @returns {string} [returns.recommendation] - Recommendation if not feasible
   * @example
   * const calculation = await dawn.calculateDawnStakingAmounts({
   *   inputs: [{ value: 500000 }],
   *   desiredEscrowAmount: 100000,
   *   desiredTimelockAmount: 200000
   * });
   */
  async calculateDawnStakingAmounts(params) {
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