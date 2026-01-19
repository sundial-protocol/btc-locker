/**
 * @fileoverview Dawn Protocol staking functionality
 * @description Create transactions for Dawn protocol staking with dual outputs:
 * configurable amount to escrow script and configurable amount to timelock script
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core";
import type { UTXO, ScriptInfo } from "../types";

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

interface DawnWithdrawalInput {
  txid: string;
  vout: number;
  value: number;
  redeemScript: string;
}

interface DawnWithdrawalParams {
  escrowInputs: DawnWithdrawalInput[];
  timelockInputs: DawnWithdrawalInput[];
  destination: string;
  escrowPrivateKey: string;
  timelockPrivateKey: string;
  feeAmount?: number;
  api?: any; // Bitcoin API instance for fetching transaction data
}

interface DawnWithdrawalResult {
  hex: string;
  txid: string;
  size: number;
  fee: number;
  inputs: {
    escrowValue: number;
    timelockValue: number;
    totalValue: number;
  };
  output: {
    destination: string;
    value: number;
  };
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

  /**
   * Create a Dawn withdrawal transaction that combines escrow and timelock inputs into a single output
   * @async
   * @param params - Dawn withdrawal parameters
   * @returns Dawn withdrawal transaction details
   * @throws If insufficient funds or invalid parameters
   * @example
   * const dawn = new DawnStakingManager();
   * const tx = await dawn.createDawnWithdrawalTransaction({
   *   escrowInputs: [{ txid: '...', vout: 0, value: 100000, redeemScript: '...' }],
   *   timelockInputs: [{ txid: '...', vout: 0, value: 200000, redeemScript: '...' }],
   *   destination: 'tb1q...',
   *   escrowPrivateKey: '...',
   *   timelockPrivateKey: '...',
   *   feeAmount: 2000
   * });
   */
  async createDawnWithdrawalTransaction(params: DawnWithdrawalParams): Promise<DawnWithdrawalResult> {
    await this.ensureInitialized();
    const { ECPair } = getECC();
    const {
      escrowInputs,
      timelockInputs,
      destination,
      escrowPrivateKey,
      timelockPrivateKey,
      feeAmount = 2000,
      api,
    } = params;

    // Validate that we have at least one input
    if (escrowInputs.length === 0 && timelockInputs.length === 0) {
      throw new Error("No inputs provided for withdrawal");
    }

    // Create key pairs from private keys (only if we need them)
    const escrowKeyPair = escrowInputs.length > 0 ? ECPair.fromPrivateKey(Buffer.from(escrowPrivateKey, "hex"), {
      network: this.network,
    }) : null;
    
    const timelockKeyPair = timelockInputs.length > 0 ? ECPair.fromPrivateKey(Buffer.from(timelockPrivateKey, "hex"), {
      network: this.network,
    }) : null;

    // Calculate total values
    const escrowValue = escrowInputs.reduce((sum, input) => sum + input.value, 0);
    const timelockValue = timelockInputs.reduce((sum, input) => sum + input.value, 0);
    const totalInputValue = escrowValue + timelockValue;
    const outputValue = totalInputValue - feeAmount;

    if (outputValue <= 546) { // Dust threshold
      throw new Error("Output amount would be below dust threshold after fees");
    }

    const psbt = new bitcoin.Psbt({ network: this.network });

    // Determine if we need to set locktime for escrow and timelock scripts
    let maxLocktime = 0;
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Check escrow inputs
    for (const input of escrowInputs) {
      try {
        const script = Buffer.from(input.redeemScript, 'hex');
        if (script.length > 5 && script[0] === 0x63) { // OP_IF (escrow script)
          // Extract timestamp (next 4 bytes after OP_IF and push opcode)
          const timestampBytes = script.slice(2, 6);
          const timestamp = timestampBytes.readUInt32LE(0);
          
          console.log(`Debug: Escrow - Current time: ${currentTime}, Script deadline: ${timestamp}`);
          console.log(`Debug: Escrow - Current time human: ${new Date(currentTime * 1000).toISOString()}`);
          console.log(`Debug: Escrow - Deadline human: ${new Date(timestamp * 1000).toISOString()}`);
          
          // Validate that we're past the deadline
          if (currentTime < timestamp) {
            throw new Error(`Cannot withdraw from escrow script yet. Current time: ${currentTime}, Deadline: ${timestamp}. Wait until ${new Date(timestamp * 1000).toISOString()}`);
          }
          
          maxLocktime = Math.max(maxLocktime, timestamp);
        }
      } catch (parseError) {
        // Re-throw validation errors, ignore parsing errors
        if (parseError instanceof Error && parseError.message.includes('Cannot withdraw')) {
          throw parseError;
        }
      }
    }

    // Check timelock inputs
    for (const input of timelockInputs) {
      try {
        const script = Buffer.from(input.redeemScript, 'hex');
        if (script.length > 4 && script[0] === 0x04) { // Push 4 bytes (timelock script)
          // Extract timestamp (next 4 bytes after push opcode)
          const timestampBytes = script.slice(1, 5);
          const timestamp = timestampBytes.readUInt32LE(0);
          
          console.log(`Debug: Timelock - Current time: ${currentTime}, Script deadline: ${timestamp}`);
          console.log(`Debug: Timelock - Current time human: ${new Date(currentTime * 1000).toISOString()}`);
          console.log(`Debug: Timelock - Deadline human: ${new Date(timestamp * 1000).toISOString()}`);
          
          // Validate that we're past the deadline
          if (currentTime < timestamp) {
            throw new Error(`Cannot withdraw from timelock script yet. Current time: ${currentTime}, Deadline: ${timestamp}. Wait until ${new Date(timestamp * 1000).toISOString()}`);
          }
          
          maxLocktime = Math.max(maxLocktime, timestamp);
        }
      } catch (parseError) {
        // Re-throw validation errors, ignore parsing errors
        if (parseError instanceof Error && parseError.message.includes('Cannot withdraw')) {
          throw parseError;
        }
      }
    }

    // Set transaction locktime if needed
    if (maxLocktime > 0) {
      psbt.setLocktime(maxLocktime);
    }

    // Add escrow inputs
    for (let i = 0; i < escrowInputs.length; i++) {
      const input = escrowInputs[i];
      const redeemScript = Buffer.from(input.redeemScript, "hex");
      
      let inputData;
      if (api) {
        // Fetch full transaction for nonWitnessUtxo
        try {
          const txHex = await api.getTransaction(input.txid);
          inputData = {
            hash: input.txid,
            index: input.vout,
            nonWitnessUtxo: Buffer.from(txHex, "hex"),
            redeemScript: redeemScript,
            sequence: 0xfffffffe, // Enable locktime validation
          };
        } catch (error) {
          throw new Error(`Failed to fetch transaction ${input.txid}: ${(error as Error).message}`);
        }
      } else {
        // Fallback to witnessUtxo (may not work for all P2SH scripts)
        const scriptHash = bitcoin.crypto.hash160(redeemScript);
        const p2shScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_HASH160,
          scriptHash,
          bitcoin.opcodes.OP_EQUAL,
        ]);

        inputData = {
          hash: input.txid,
          index: input.vout,
          witnessUtxo: {
            script: p2shScript,
            value: BigInt(input.value),
          },
          redeemScript: redeemScript,
          sequence: 0xfffffffe, // Enable locktime validation
        };
      }

      psbt.addInput(inputData);
    }

    // Add timelock inputs
    for (let i = 0; i < timelockInputs.length; i++) {
      const input = timelockInputs[i];
      const redeemScript = Buffer.from(input.redeemScript, "hex");
      
      let inputData;
      if (api) {
        // Fetch full transaction for nonWitnessUtxo
        try {
          const txHex = await api.getTransaction(input.txid);
          inputData = {
            hash: input.txid,
            index: input.vout,
            nonWitnessUtxo: Buffer.from(txHex, "hex"),
            redeemScript: redeemScript,
            sequence: 0xfffffffe, // Enable locktime validation
          };
        } catch (error) {
          throw new Error(`Failed to fetch transaction ${input.txid}: ${(error as Error).message}`);
        }
      } else {
        // Fallback to witnessUtxo (may not work for all P2SH scripts)
        const scriptHash = bitcoin.crypto.hash160(redeemScript);
        const p2shScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_HASH160,
          scriptHash,
          bitcoin.opcodes.OP_EQUAL,
        ]);

        inputData = {
          hash: input.txid,
          index: input.vout,
          witnessUtxo: {
            script: p2shScript,
            value: BigInt(input.value),
          },
          redeemScript: redeemScript,
          sequence: 0xfffffffe, // Enable locktime validation
        };
      }

      psbt.addInput(inputData);
    }

    // Add single output to destination
    psbt.addOutput({
      address: destination,
      value: BigInt(outputValue),
    });

    // Sign escrow inputs
    if (escrowKeyPair && escrowInputs.length > 0) {
      for (let i = 0; i < escrowInputs.length; i++) {
        try {
          psbt.signInput(i, escrowKeyPair);
        } catch (error) {
          throw new Error(`Failed to sign escrow input ${i}: ${(error as Error).message}`);
        }
      }
    }

    // Sign timelock inputs
    if (timelockKeyPair && timelockInputs.length > 0) {
      for (let i = 0; i < timelockInputs.length; i++) {
        const inputIndex = escrowInputs.length + i;
        try {
          psbt.signInput(inputIndex, timelockKeyPair);
        } catch (error) {
          throw new Error(`Failed to sign timelock input ${inputIndex}: ${(error as Error).message}`);
        }
      }
    }

    // Finalize inputs with custom finalizers for conditional scripts
    for (let i = 0; i < escrowInputs.length; i++) {
      try {
        // For escrow scripts, we need a custom finalizer to provide the correct stack
        psbt.finalizeInput(i, (inputIndex: number, input: any) => {
          const scriptSig = input.partialSig?.[0];
          if (!scriptSig) {
            throw new Error("Missing signature for escrow input");
          }
          
          const redeemScript = input.redeemScript;
          if (!redeemScript) {
            throw new Error("Missing redeem script for escrow input");
          }

          // Dawn withdrawal always uses the "after deadline" path (OP_TRUE)
          const scriptWitness = bitcoin.script.compile([
            scriptSig.signature,
            bitcoin.opcodes.OP_TRUE, // Always choose IF branch (after deadline)
            redeemScript
          ]);

          return {
            finalScriptSig: scriptWitness,
            finalScriptWitness: undefined
          };
        });
      } catch (error) {
        throw new Error(`Failed to finalize escrow input ${i}: ${(error as Error).message}`);
      }
    }

    // Finalize timelock inputs with custom finalizers
    for (let i = 0; i < timelockInputs.length; i++) {
      const inputIndex = escrowInputs.length + i;
      try {
        psbt.finalizeInput(inputIndex, (idx: number, input: any) => {
          const scriptSig = input.partialSig?.[0];
          if (!scriptSig) {
            throw new Error("Missing signature for timelock input");
          }
          
          const redeemScript = input.redeemScript;
          if (!redeemScript) {
            throw new Error("Missing redeem script for timelock input");
          }

          // For timelock scripts, provide signature and redeem script
          const scriptWitness = bitcoin.script.compile([
            scriptSig.signature,
            redeemScript
          ]);

          return {
            finalScriptSig: scriptWitness,
            finalScriptWitness: undefined
          };
        });
      } catch (error) {
        throw new Error(`Failed to finalize timelock input ${inputIndex}: ${(error as Error).message}`);
      }
    }

    // Extract the final transaction
    const transaction = psbt.extractTransaction();

    return {
      hex: transaction.toHex(),
      txid: transaction.getId(),
      size: transaction.byteLength(),
      fee: feeAmount,
      inputs: {
        escrowValue,
        timelockValue,
        totalValue: totalInputValue,
      },
      output: {
        destination,
        value: outputValue,
      },
    };
  }
}

export default DawnStakingManager;