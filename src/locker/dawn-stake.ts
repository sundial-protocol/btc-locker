/**
 * @fileoverview Dawn Protocol staking functionality
 * @description Create transactions for Dawn protocol staking with dual outputs:
 * configurable amount to escrow script and configurable amount to timelock script
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core";
import type { UTXO, ScriptInfo } from "../types";
import BitcoinAPI, { ApiUTXO } from "../bitcoin-api";

/**
 * Parameters for Dawn staking transactions
 * @interface DawnStakingParams
 * @description Configuration for creating Dawn protocol staking transactions with dual outputs
 */
export interface DawnStakingParams {
  /** Array of unspent transaction outputs to stake (optional - will auto-select from address if not provided) */
  inputs?: UTXO[];
  /** Source address for automatic UTXO selection (required if inputs not provided) */
  sourceAddress?: string;
  /** Bitcoin API instance for fetching UTXOs (required if inputs not provided) */
  api?: BitcoinAPI;
  /** Escrow script address */
  escrowAddress: string;
  /** Amount to send to escrow in satoshis */
  escrowAmount: number;
  /** Timelock script address */
  timelockAddress: string;
  /** Amount to send to timelock in satoshis */
  timelockAmount: number;
  /** Optional change address for remaining funds */
  changeAddress?: string;
  /** Optional fee rate in satoshis per byte */
  feeRate?: number;
}

/**
 * Result of Dawn staking transaction
 * @interface DawnStakingResult
 * @description Transaction result with detailed output breakdown for Dawn staking
 */
export interface DawnStakingResult {
  /** Transaction in hexadecimal format */
  hex: string;
  /** Transaction ID (hash) */
  txid: string;
  /** Transaction size in bytes */
  size: number;
  /** Transaction fee in satoshis */
  fee: number;
  /** Output breakdown */
  outputs: {
    /** Amount sent to escrow in satoshis */
    escrowAmount: number;
    /** Amount sent to timelock in satoshis */
    timelockAmount: number;
    /** Optional change amount in satoshis */
    changeAmount?: number;
  };
}

/**
 * Parameters for Dawn staking with script data
 * @interface DawnStakingWithScriptParams
 * @description Configuration for creating Dawn staking transactions with provided timelock script information
 * @extends Omit<DawnStakingParams, 'timelockAddress'>
 */
export interface DawnStakingWithScriptParams extends Omit<DawnStakingParams, 'timelockAddress'> {
  /** Timelock script information object */
  timelockScript: ScriptInfo;
}

/**
 * Result of Dawn staking transaction with script information
 * @interface DawnStakingWithScriptResult
 * @description Dawn staking transaction result with additional timelock script details
 * @extends DawnStakingResult
 */
export interface DawnStakingWithScriptResult extends DawnStakingResult {
  /** Timelock script details */
  timelockScript: {
    /** Timelock script address */
    address: string;
    /** Script type */
    type: string;
    /** Optional locktime value */
    locktime?: number;
  };
}

/**
 * Parameters for Dawn staking amount calculation
 * @interface DawnStakingCalculationParams
 * @description Configuration for calculating optimal Dawn staking amounts and fees
 */
export interface DawnStakingCalculationParams {
  /** Array of available inputs with their values (optional - will fetch from address if not provided) */
  inputs?: Array<{ value: number }>;
  /** Source address for automatic UTXO fetching (required if inputs not provided) */
  sourceAddress?: string;
  /** Bitcoin API instance for fetching UTXOs (required if inputs not provided) */
  api?: BitcoinAPI;
  /** Desired amount for escrow output in satoshis */
  desiredEscrowAmount: number;
  /** Desired amount for timelock output in satoshis */
  desiredTimelockAmount: number;
  /** Whether to include change output in calculation */
  includeChange?: boolean;
  /** Optional fee rate in satoshis per byte */
  feeRate?: number;
}

/**
 * Result of Dawn staking amount calculation
 * @interface DawnStakingCalculationResult
 * @description Calculation results for optimal Dawn staking amounts and feasibility
 */
export interface DawnStakingCalculationResult {
  /** Total input value in satoshis */
  totalInputValue: number;
  /** Estimated transaction fee in satoshis */
  estimatedFee: number;
  /** Total required amount including fees in satoshis */
  totalRequired: number;
  /** Calculated change amount in satoshis */
  changeAmount: number;
  /** Whether the staking is feasible with available inputs */
  feasible: boolean;
  /** Optional recommendation for optimization */
  recommendation?: string;
}

/**
 * Parameters for Dawn withdrawal
 * @interface DawnWithdrawalParams
 * @description Configuration for withdrawing from both escrow and timelock Dawn staking outputs
 */
export interface DawnWithdrawalParams {
  /** Array of escrow inputs to withdraw from */
  escrowInputs: UTXO[];
  /** Escrow redeem script in hexadecimal format */
  escrowRedeemScript: string;
  /** Array of timelock inputs to withdraw from */
  timelockInputs: UTXO[];
  /** Timelock redeem script in hexadecimal format */
  timelockRedeemScript: string;
  /** Destination address for withdrawn funds */
  destination: string;
  /** Optional fixed fee amount in satoshis */
  feeAmount?: number;
  /** Optional Bitcoin API instance for fetching transaction data */
  api?: any;
}

/**
 * Result of Dawn withdrawal
 * @interface DawnWithdrawalResult
 * @description Transaction result with detailed input and output information for Dawn withdrawal
 */
export interface DawnWithdrawalResult {
  /** Transaction in hexadecimal format */
  hex: string;
  /** Transaction ID (hash) */
  txid: string;
  /** Transaction size in bytes */
  size: number;
  /** Transaction fee in satoshis */
  fee: number;
  /** Input details */
  inputs: {
    /** Total value from escrow inputs in satoshis */
    escrowValue: number;
    /** Total value from timelock inputs in satoshis */
    timelockValue: number;
    /** Total input value in satoshis */
    totalValue: number;
  };
  /** Output details */
  output: {
    /** Destination address for withdrawn funds */
    destination: string;
    /** Final output value after fees in satoshis */
    value: number;
  };
}

/**
 * Parameters for signing a Dawn staking transaction
 * @interface DawnStakingSigningParams
 * @description Configuration for signing an unsigned Dawn staking PSBT
 */
export interface DawnStakingSigningParams {
  /** Unsigned PSBT in base64 format */
  unsignedPsbt: string;
  /** Private key for signing in hex format */
  privateKey: string;
  /** Array of input UTXOs for witness data (optional - will be extracted from PSBT if not provided) */
  inputs?: UTXO[];
}

/**
 * Parameters for Dawn withdrawal transaction
 * @interface DawnWithdrawalCreationParams
 * @description Configuration for creating an unsigned Dawn withdrawal transaction
 */
export interface DawnWithdrawalCreationParams extends Omit<DawnWithdrawalParams, 'privateKey'> {
  // All parameters except privateKey
}

/**
 * Parameters for signing a Dawn withdrawal transaction  
 * @interface DawnWithdrawalSigningParams
 * @description Configuration for signing an unsigned Dawn withdrawal PSBT
 */
export interface DawnWithdrawalSigningParams {
  /** Unsigned PSBT in base64 format */
  unsignedPsbt: string;
  /** Private key for signing escrow inputs in hex format */
  escrowPrivateKey?: string;
  /** Private key for signing timelock inputs in hex format */
  timelockPrivateKey?: string;
  /** Array of escrow inputs */
  escrowInputs: UTXO[];
  /** Escrow redeem script in hexadecimal format */
  escrowRedeemScript: string;
  /** Array of timelock inputs */
  timelockInputs: UTXO[];
  /** Timelock redeem script in hexadecimal format */
  timelockRedeemScript: string;
}

/**
 * Dawn Protocol staking manager class
 * @class DawnStakingManager
 * @description Creates Bitcoin transactions for Dawn protocol staking that send funds
 * to two destinations in a single transaction: escrow script and configurable timelock script
 */
export class DawnStakingManager extends BTCLockerCore {
  /**
   * Select optimal UTXOs for a given target amount using a greedy algorithm
   * @private
   * @param availableUtxos - Array of available UTXOs
   * @param targetAmount - Target amount needed (including fees)
   * @returns Selected UTXOs that cover the target amount
   */
  private selectUtxos(availableUtxos: UTXO[], targetAmount: number): UTXO[] {
    // Sort UTXOs by value (largest first for efficiency)
    const sortedUtxos = [...availableUtxos].sort((a, b) => b.value - a.value);
    
    const selectedUtxos: UTXO[] = [];
    let totalValue = 0;
    
    for (const utxo of sortedUtxos) {
      selectedUtxos.push(utxo);
      totalValue += utxo.value;
      
      if (totalValue >= targetAmount) {
        break;
      }
    }
    
    if (totalValue < targetAmount) {
      throw new Error(
        `Insufficient funds in available UTXOs. Need: ${targetAmount}, Available: ${totalValue}, Shortage: ${targetAmount - totalValue}`
      );
    }
    
    return selectedUtxos;
  }

  /**
   * Create a Dawn staking transaction
   * @async
   * @param params - Dawn staking parameters
   * @returns Unsigned PSBT as base64 string
   * @throws If insufficient funds or invalid parameters
   * @example
   * // Using specific inputs
   * const dawn = new DawnStakingManager();
   * const tx = await dawn.createDawnStakingTransaction({
   *   inputs: [{ txid: '...', vout: 0, value: 500000 }],
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockAddress: '3XYZ789...',
   *   timelockAmount: 200000
   * });
   * 
   * // Using automatic UTXO fetching from address
   * const api = new BitcoinAPI('testnet');
   * const tx = await dawn.createDawnStakingTransaction({
   *   sourceAddress: 'tb1q...',
   *   api: api,
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockAddress: '3XYZ789...',
   *   timelockAmount: 200000
   * });
   */
  async createDawnStakingTransaction(params: DawnStakingParams): Promise<string> {
    await this.ensureInitialized();
    const {
      inputs: providedInputs,
      sourceAddress,
      api,
      escrowAddress,
      escrowAmount,
      timelockAddress,
      timelockAmount,
      changeAddress,
      feeRate = 10,
    } = params;

    // Validate that either inputs or sourceAddress+api are provided
    if (!providedInputs && (!sourceAddress || !api)) {
      throw new Error("Either inputs or both sourceAddress and api must be provided");
    }

    if (providedInputs && (!Array.isArray(providedInputs) || providedInputs.length === 0)) {
      throw new Error("inputs must be a non-empty array when provided");
    }

    let inputs: UTXO[];
    
    if (providedInputs) {
      // Use provided inputs
      inputs = providedInputs;
    } else {
      // Fetch UTXOs from address and auto-select
      const apiUtxos = await api!.getAddressUtxos(sourceAddress!);
      const availableInputs = apiUtxos.map((apiUtxo: ApiUTXO) => apiUtxo.utxo);
      
      if (availableInputs.length === 0) {
        throw new Error(`No confirmed UTXOs available at address ${sourceAddress}`);
      }
      
      // First estimate required amount for input selection
      const outputCount = changeAddress ? 3 : 2;
      const estimatedInputCount = Math.min(availableInputs.length, 3); // Estimate 1-3 inputs
      const estimatedSize = 10 + estimatedInputCount * 148 + outputCount * 34 + 20;
      const estimatedFee = estimatedSize * feeRate;
      const targetAmount = escrowAmount + timelockAmount + estimatedFee;
      
      inputs = this.selectUtxos(availableInputs, targetAmount);
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
      // Create PSBT for transaction construction
      const psbt = new bitcoin.Psbt({ network: this.network });

      // Add inputs (using placeholder witnessUtxo - actual script will be added during signing)
      for (const input of inputs) {
        const inputData = {
          hash: input.txid,
          index: input.vout,
          witnessUtxo: {
            script: Buffer.alloc(22), // Placeholder for P2WPKH script
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

      // Return unsigned PSBT
      return psbt.toBase64();
    } catch (error) {
      throw new Error(`Failed to create Dawn staking transaction: ${(error as Error).message}`);
    }
  }

  /**
   * Create a Dawn staking transaction using timelock script data
   * @async
   * @param params - Dawn staking parameters with script data
   * @returns Unsigned PSBT as base64 string
   * @example
   * const timelockScript = await locker.createTimelockScript(locktime, publicKey);
   * // Using specific inputs
   * const unsignedPsbt = await dawn.createDawnStakingTransactionWithScript({
   *   inputs: [{ txid: '...', vout: 0, value: 500000 }],
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockScript: timelockScript,
   *   timelockAmount: 200000
   * });
   * // Or using automatic UTXO fetching from address
   * const api = new BitcoinAPI('testnet');
   * const unsignedPsbt = await dawn.createDawnStakingTransactionWithScript({
   *   sourceAddress: 'tb1q...',
   *   api: api,
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockScript: timelockScript,
   *   timelockAmount: 200000
   * });
   */
  async createDawnStakingTransactionWithScript(params: DawnStakingWithScriptParams): Promise<string> {
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

    return await this.createDawnStakingTransaction(txParams);
  }

  /**
   * Calculate optimal amounts for Dawn staking with both outputs
   * @async
   * @param params - Calculation parameters
   * @returns Calculation results
   * @example
   * // Using specific inputs
   * const calculation = await dawn.calculateDawnStakingAmounts({
   *   inputs: [{ value: 500000 }],
   *   desiredEscrowAmount: 100000,
   *   desiredTimelockAmount: 200000
   * });
   * // Using automatic UTXO fetching from address
   * const api = new BitcoinAPI('testnet');
   * const calculation = await dawn.calculateDawnStakingAmounts({
   *   sourceAddress: 'tb1q...',
   *   api: api,
   *   desiredEscrowAmount: 100000,
   *   desiredTimelockAmount: 200000
   * });
   */
  async calculateDawnStakingAmounts(params: DawnStakingCalculationParams): Promise<DawnStakingCalculationResult> {
    const {
      inputs: providedInputs,
      sourceAddress,
      api,
      desiredEscrowAmount,
      desiredTimelockAmount,
      includeChange = false,
      feeRate = 10,
    } = params;

    // Validate that either inputs or sourceAddress+api are provided
    if (!providedInputs && (!sourceAddress || !api)) {
      throw new Error("Either inputs or both sourceAddress and api must be provided");
    }

    let inputs: Array<{ value: number }>;
    
    if (providedInputs) {
      if (!Array.isArray(providedInputs)) {
        throw new Error("inputs must be an array when provided");
      }
      inputs = providedInputs;
    } else {
      // Fetch UTXOs from address
      const apiUtxos = await api!.getAddressUtxos(sourceAddress!);
      const availableInputs = apiUtxos.map((apiUtxo: ApiUTXO) => apiUtxo.utxo);
      
      if (availableInputs.length === 0) {
        throw new Error(`No confirmed UTXOs available at address ${sourceAddress}`);
      }
      
      // Auto-select from available UTXOs for calculation
      const outputCount = includeChange ? 3 : 2;
      const estimatedInputCount = Math.min(availableInputs.length, 3);
      const estimatedSize = 10 + estimatedInputCount * 148 + outputCount * 34 + 20;
      const estimatedFee = estimatedSize * feeRate;
      const targetAmount = desiredEscrowAmount + desiredTimelockAmount + estimatedFee;
      
      try {
        const selectedUtxos = this.selectUtxos(availableInputs, targetAmount);
        inputs = selectedUtxos.map(utxo => ({ value: utxo.value }));
      } catch (error) {
        // If we can't select enough UTXOs, use all available for calculation
        inputs = availableInputs.map(utxo => ({ value: utxo.value }));
      }
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
   * @returns Unsigned withdrawal PSBT as base64 string
   * @throws If insufficient funds or invalid parameters
   * @example
   * const dawn = new DawnStakingManager();
   * const unsignedPsbt = await dawn.createDawnWithdrawalTransaction({
   *   escrowInputs: [{ txid: '...', vout: 0, value: 100000, redeemScript: '...' }],
   *   timelockInputs: [{ txid: '...', vout: 0, value: 200000, redeemScript: '...' }],
   *   destination: 'tb1q...',
   *   feeAmount: 2000
   * });
   */
  async createDawnWithdrawalTransaction(params: DawnWithdrawalParams): Promise<string> {
    await this.ensureInitialized();
    const {
      escrowInputs,
      escrowRedeemScript,
      timelockInputs,
      timelockRedeemScript,
      destination,
      feeAmount = 2000,
      api,
    } = params;

    // Validate that we have at least one input
    if (escrowInputs.length === 0 && timelockInputs.length === 0) {
      throw new Error("No inputs provided for withdrawal");
    }

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
    
    try {
      const script = Buffer.from(escrowRedeemScript, 'hex');
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

      try {
        const script = Buffer.from(timelockRedeemScript, 'hex');
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


    // Set transaction locktime if needed
    if (maxLocktime > 0) {
      psbt.setLocktime(maxLocktime);
    }

    // Add escrow inputs
    for (let i = 0; i < escrowInputs.length; i++) {
      const input = escrowInputs[i];
      const redeemScript = Buffer.from(escrowRedeemScript, "hex");
      
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
      const redeemScript = Buffer.from(timelockRedeemScript, "hex");
      
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

    // Return unsigned PSBT
    return psbt.toBase64();
  }



}

export default DawnStakingManager;