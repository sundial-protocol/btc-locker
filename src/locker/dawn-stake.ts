/**
 * @fileoverview Dawn Protocol staking functionality using Taproot
 * @description Create transactions for Dawn protocol staking with dual P2TR outputs:
 * configurable amount to escrow tapscript and configurable amount to timelock tapscript,
 * both anchored under the Sundial namespace internal pubkey.
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore } from "./core";
import type { UTXO, ScriptInfo } from "../types";
import { ApiUTXO } from "../bitcoin-api";
import ScriptUtils from "../utils/scripts";
import FeeUtils from "../utils/fees";
import { TAPROOT_LEAF_VERSION } from "../utils/scripts";

/**
 * Parameters for Dawn staking transactions
 * @interface DawnStakingParams
 * @description Configuration for creating Dawn protocol staking transactions with dual outputs
 */
export interface DawnStakingParams {
  /** Array of unspent transaction outputs to stake (optional - will auto-select from address if not provided) */
  inputs?: UTXO[];
  /** Source address for automatic UTXO selection (required if inputs not provided) */
  sourceAddress: string;
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
  /** Optional fee address for protocol fees */
  feeAddress?: string;
  /** Optional protocol fee amount in satoshis (required if feeAddress is provided) */
  protocolFeeAmount?: number;
  /** Optional arbitrary string metadata to include in transaction (max 80 bytes) */
  metadata?: string;
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
    /** Optional protocol fee amount in satoshis */
    protocolFeeAmount?: number;
    /** Optional change amount in satoshis */
    changeAmount?: number;
    /** Optional metadata included in transaction */
    metadata?: string;
  };
}

/**
 * Parameters for Dawn staking with script data
 * @interface DawnStakingWithScriptParams
 * @description Configuration for creating Dawn staking transactions with provided timelock script information
 * @extends Omit<DawnStakingParams, timelockAddress'>
 */
export interface DawnStakingWithScriptParams extends Omit<
  DawnStakingParams,
  "timelockAddress"
> {
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
  sourceAddress: string;
  /** Desired amount for escrow output in satoshis */
  desiredEscrowAmount: number;
  /** Desired amount for timelock output in satoshis */
  desiredTimelockAmount: number;
  /** Whether to include change output in calculation */
  includeChange?: boolean;
  /** Optional fee rate in satoshis per byte */
  feeRate?: number;
  /** Optional protocol fee amount in satoshis */
  protocolFeeAmount?: number;
  /** Optional arbitrary string metadata to include in transaction (max 80 bytes) */
  metadata?: string;
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
  /** Array of escrow inputs to withdraw from (optional - will fetch all UTXOs from escrow address if not provided) */
  escrowInputs?: UTXO[];
  /** Escrow script address (optional - will be calculated from escrowScript if not provided) */
  escrowAddress?: string;
  /** Escrow script info returned from createEscrowScript (contains redeemScript, controlBlock, etc.) */
  escrowScript: ScriptInfo;
  /** Array of timelock inputs to withdraw from (optional - will fetch all UTXOs from timelock address if not provided) */
  timelockInputs?: UTXO[];
  /** Timelock script address (optional - will be calculated from timelockScript if not provided) */
  timelockAddress?: string;
  /** Timelock script info returned from createTimelockScript (contains redeemScript, controlBlock, etc.) */
  timelockScript: ScriptInfo;
  /** Destination address for withdrawn funds */
  destination: string;
  /** Optional fixed fee amount in satoshis */
  feeAmount?: number;
  /** Optional fee address for protocol fees */
  feeAddress?: string;
  /** Optional protocol fee amount in satoshis (required if feeAddress is provided) */
  protocolFeeAmount?: number;
  /** Optional arbitrary string metadata to include in transaction (max 80 bytes) */
  metadata?: string;
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
  outputs: {
    /** Destination address for withdrawn funds */
    destination: string;
    /** Final output value after fees in satoshis */
    destinationValue: number;
    /** Optional protocol fee amount in satoshis */
    protocolFeeAmount?: number;
    /** Optional metadata included in transaction */
    metadata?: string;
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
export interface DawnWithdrawalCreationParams extends Omit<
  DawnWithdrawalParams,
  "privateKey"
> {
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
  /** Array of escrow inputs (optional - will be extracted from PSBT if not provided) */
  escrowInputs?: UTXO[];
  /** Escrow script info (contains redeemScript, controlBlock, etc.) */
  escrowScript: ScriptInfo;
  /** Array of timelock inputs (optional - will be extracted from PSBT if not provided) */
  timelockInputs?: UTXO[];
  /** Timelock script info (contains redeemScript, controlBlock, etc.) */
  timelockScript: ScriptInfo;
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
        `Insufficient funds in available UTXOs. Need: ${targetAmount}, Available: ${totalValue}, Shortage: ${targetAmount - totalValue}`,
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
   *   timelockAmount: 200000,
   *   metadata: 'Dawn Protocol v1.0 stake'
   * });
   *
   * // Using automatic UTXO fetching from address
   * const tx = await dawn.createDawnStakingTransaction({
   *   sourceAddress: 'tb1q...',
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockAddress: '3XYZ789...',
   *   timelockAmount: 200000,
   *   metadata: 'User123 staking'
   * });
   */
  async createDawnStakingTransaction(
    params: DawnStakingParams,
  ): Promise<string> {
    await this.ensureInitialized();
    const {
      inputs: providedInputs,
      sourceAddress,
      escrowAddress,
      escrowAmount,
      timelockAddress,
      timelockAmount,
      changeAddress,
      feeRate = 10,
      feeAddress,
      protocolFeeAmount,
      metadata,
    } = params;

    if (
      providedInputs &&
      (!Array.isArray(providedInputs) || providedInputs.length === 0)
    ) {
      throw new Error("inputs must be a non-empty array when provided");
    }

    // Validate fee parameters
    if (feeAddress && !protocolFeeAmount) {
      throw new Error(
        "protocolFeeAmount is required when feeAddress is provided",
      );
    }

    if (protocolFeeAmount && !feeAddress) {
      throw new Error(
        "feeAddress is required when protocolFeeAmount is provided",
      );
    }

    // Validate metadata
    if (metadata && Buffer.byteLength(metadata, "utf8") > 80) {
      throw new Error(
        `Metadata exceeds maximum size of 80 bytes. Current size: ${Buffer.byteLength(metadata, "utf8")} bytes`,
      );
    }

    let inputs: UTXO[];

    if (providedInputs) {
      // Use provided inputs
      inputs = providedInputs;
    } else {
      // Fetch UTXOs from address and auto-select
      const apiUtxos = await this.api.getAddressUtxos(sourceAddress);
      const availableInputs = apiUtxos.filter((utxo) => utxo.status.confirmed);

      if (availableInputs.length === 0) {
        throw new Error(
          `No confirmed UTXOs available at address ${sourceAddress}`,
        );
      }

      // Calculate number of outputs (2 required + optional protocol fee + optional change + optional metadata)
      let outputCount = 2;
      if (protocolFeeAmount && feeAddress) outputCount++;
      if (changeAddress) outputCount++;
      if (metadata) outputCount++;

      // First estimate required amount for input selection (Taproot sizes)
      const estimatedInputCount = Math.min(availableInputs.length, 3); // Estimate 1-3 inputs
      const estimatedFee = FeeUtils.estimateFee(estimatedInputCount, outputCount, feeRate, 20);
      const targetAmount =
        escrowAmount + timelockAmount + (protocolFeeAmount || 0) + estimatedFee;

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

    // Calculate number of outputs (2 required + optional protocol fee + optional change + optional metadata)
    let outputCount = 2;
    if (protocolFeeAmount && feeAddress) outputCount++;
    if (changeAddress) outputCount++;
    if (metadata) outputCount++;

    // Estimate transaction size for fee calculation (Taproot with script overhead)
    const estimatedFee = FeeUtils.estimateFee(inputs.length, outputCount, feeRate, 20);

    // Calculate total required amount
    const totalRequiredAmount =
      escrowAmount + timelockAmount + (protocolFeeAmount || 0) + estimatedFee;
    const changeAmount = totalInputValue - totalRequiredAmount;

    if (changeAmount < 0) {
      throw new Error(
        `Insufficient funds. Total: ${totalInputValue}, Required: ${totalRequiredAmount} (Escrow: ${escrowAmount}, Timelock: ${timelockAmount}${protocolFeeAmount ? `, Protocol Fee: ${protocolFeeAmount}` : ""}, Network Fee: ${estimatedFee}), Shortage: ${Math.abs(changeAmount)}`,
      );
    }

    // Minimum output amount (dust threshold)
    const dustThreshold = 546;

    if (escrowAmount < dustThreshold) {
      throw new Error(
        `Escrow amount ${escrowAmount} is below dust threshold ${dustThreshold}`,
      );
    }

    if (timelockAmount < dustThreshold) {
      throw new Error(
        `Timelock amount ${timelockAmount} is below dust threshold ${dustThreshold}`,
      );
    }

    if (protocolFeeAmount && protocolFeeAmount < dustThreshold) {
      throw new Error(
        `Protocol fee amount ${protocolFeeAmount} is below dust threshold ${dustThreshold}`,
      );
    }

    // Check if change is above dust threshold if change address provided
    if (changeAddress && changeAmount > 0 && changeAmount < dustThreshold) {
      throw new Error(
        `Change amount ${changeAmount} is below dust threshold ${dustThreshold}. Either increase inputs or remove change address.`,
      );
    }

    try {
      // Create PSBT for transaction construction
      const psbt = new bitcoin.Psbt({ network: this.network });

      // Add inputs with proper P2TR witnessUtxo scripts
      for (const input of inputs) {
        // For UTXO selection, we need to derive the P2TR script from the source address
        // Since we don't have the public key here, we'll let the signing logic fill it
        const inputData = {
          hash: input.txid,
          index: input.vout,
          witnessUtxo: {
            script: Buffer.alloc(0), // Empty buffer - will be filled during signing
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

      // 3. Protocol fee output (if specified)
      if (
        feeAddress &&
        protocolFeeAmount &&
        protocolFeeAmount >= dustThreshold
      ) {
        psbt.addOutput({
          address: feeAddress,
          value: BigInt(protocolFeeAmount),
        });
      }

      // 4. Change output (if specified and above dust threshold)
      if (changeAddress && changeAmount >= dustThreshold) {
        psbt.addOutput({
          address: changeAddress,
          value: BigInt(changeAmount),
        });
      }

      // 5. Metadata output (if specified)
      if (metadata) {
        const metadataBuffer = Buffer.from(metadata, "utf8");
        const opReturnScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_RETURN,
          metadataBuffer,
        ]);
        psbt.addOutput({
          script: opReturnScript,
          value: BigInt(0),
        });
      }

      // Return unsigned PSBT
      return psbt.toBase64();
    } catch (error) {
      throw new Error(
        `Failed to create Dawn staking transaction: ${(error as Error).message}`,
      );
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
   * const unsignedPsbt = await dawn.createDawnStakingTransactionWithScript({
   *   sourceAddress: 'tb1q...',
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockScript: timelockScript,
   *   timelockAmount: 200000
   * });
   */
  async createDawnStakingTransactionWithScript(
    params: DawnStakingWithScriptParams,
  ): Promise<string> {
    const { timelockScript, ...otherParams } = params;

    // Validate timelock script
    if (!timelockScript || typeof timelockScript !== "object") {
      throw new Error("timelockScript must be a valid script object");
    }

    if (!timelockScript.address) {
      throw new Error("timelockScript must have an address property");
    }

    // Use the timelock script address
    const txParams: DawnStakingParams = {
      ...otherParams,
      timelockAddress: timelockScript.address,
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
   *   sourceAddress: 'tb1q...',
   *   inputs: [{ value: 500000 }],
   *   desiredEscrowAmount: 100000,
   *   desiredTimelockAmount: 200000
   * });
   * // Using automatic UTXO fetching from address
   * const calculation = await dawn.calculateDawnStakingAmounts({
   *   sourceAddress: 'tb1q...',
   *   desiredEscrowAmount: 100000,
   *   desiredTimelockAmount: 200000
   * });
   */
  async calculateDawnStakingAmounts(
    params: DawnStakingCalculationParams,
  ): Promise<DawnStakingCalculationResult> {
    const {
      inputs: providedInputs,
      sourceAddress,
      desiredEscrowAmount,
      desiredTimelockAmount,
      includeChange = false,
      feeRate = 10,
      protocolFeeAmount = 0,
      metadata,
    } = params;

    let inputs: Array<{ value: number }>;

    if (providedInputs) {
      if (!Array.isArray(providedInputs)) {
        throw new Error("inputs must be an array when provided");
      }
      inputs = providedInputs;
    } else {
      // Fetch UTXOs from address
      const apiUtxos = await this.api.getAddressUtxos(sourceAddress);
      const availableInputs = apiUtxos.filter((utxo) => utxo.status.confirmed);

      if (availableInputs.length === 0) {
        throw new Error(
          `No confirmed UTXOs available at address ${sourceAddress}`,
        );
      }

      // Calculate number of outputs (2 required + optional protocol fee + optional change + optional metadata)
      let outputCount = 2;
      if (protocolFeeAmount > 0) outputCount++;
      if (includeChange) outputCount++;
      if (metadata) outputCount++;

      // Auto-select from available UTXOs for calculation
      const estimatedInputCount = Math.min(availableInputs.length, 3);
      const estimatedFee = FeeUtils.estimateFee(estimatedInputCount, outputCount, feeRate, 20);
      const targetAmount =
        desiredEscrowAmount +
        desiredTimelockAmount +
        protocolFeeAmount +
        estimatedFee;

      try {
        const selectedUtxos = this.selectUtxos(availableInputs, targetAmount);
        inputs = selectedUtxos.map((utxo) => ({ value: utxo.value }));
      } catch (error) {
        // If we can't select enough UTXOs, use all available for calculation
        inputs = availableInputs.map((utxo) => ({ value: utxo.value }));
      }
    }

    if (!Number.isInteger(desiredEscrowAmount) || desiredEscrowAmount <= 0) {
      throw new Error("desiredEscrowAmount must be a positive integer");
    }

    if (
      !Number.isInteger(desiredTimelockAmount) ||
      desiredTimelockAmount <= 0
    ) {
      throw new Error("desiredTimelockAmount must be a positive integer");
    }

    // Calculate total input value
    const totalInputValue = inputs.reduce((sum, input) => sum + input.value, 0);

    // Calculate number of outputs (2 required + optional protocol fee + optional change + optional metadata)
    let outputCount = 2;
    if (protocolFeeAmount > 0) outputCount++;
    if (includeChange) outputCount++;
    if (metadata) outputCount++;

    // Estimate transaction size and fee (Taproot with script overhead)
    const estimatedFee = FeeUtils.estimateFee(inputs.length, outputCount, feeRate, 20);

    const dustThreshold = 546;
    const totalRequired =
      desiredEscrowAmount +
      desiredTimelockAmount +
      protocolFeeAmount +
      estimatedFee;
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

    if (protocolFeeAmount > 0 && protocolFeeAmount < dustThreshold) {
      feasible = false;
      recommendation += `Protocol fee amount ${protocolFeeAmount} below dust threshold ${dustThreshold}. `;
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
   * // Using specific inputs
   * const dawn = new DawnStakingManager();
   * const unsignedPsbt = await dawn.createDawnWithdrawalTransaction({
   *   escrowInputs: [{ txid: '...', vout: 0, value: 100000 }],
   *   escrowRedeemScript: '...',
   *   timelockInputs: [{ txid: '...', vout: 0, value: 200000 }],
   *   timelockRedeemScript: '...',
   *   destination: 'tb1q...',
   *   feeAmount: 2000,
   *   metadata: 'Dawn withdrawal'
   * });
   *
   * // Using automatic UTXO fetching from calculated script addresses
   * const unsignedPsbt = await dawn.createDawnWithdrawalTransaction({
   *   escrowRedeemScript: '...',
   *   timelockRedeemScript: '...',
   *   destination: 'tb1q...',
   *   feeAmount: 2000,
   *   metadata: 'Auto-withdrawal v1.0'
   * });
   */
  async createDawnWithdrawalTransaction(
    params: DawnWithdrawalParams,
  ): Promise<string> {
    await this.ensureInitialized();
    const {
      escrowInputs: providedEscrowInputs,
      escrowAddress: providedEscrowAddress,
      escrowScript,
      timelockInputs: providedTimelockInputs,
      timelockAddress: providedTimelockAddress,
      timelockScript,
      destination,
      feeAmount = 2000,
      feeAddress,
      protocolFeeAmount,
      metadata,
    } = params;

    // Validate fee parameters
    if (feeAddress && !protocolFeeAmount) {
      throw new Error(
        "protocolFeeAmount is required when feeAddress is provided",
      );
    }

    if (protocolFeeAmount && !feeAddress) {
      throw new Error(
        "feeAddress is required when protocolFeeAmount is provided",
      );
    }

    // Validate metadata
    if (metadata && Buffer.byteLength(metadata, "utf8") > 80) {
      throw new Error(
        `Metadata exceeds maximum size of 80 bytes. Current size: ${Buffer.byteLength(metadata, "utf8")} bytes`,
      );
    }

    // Use script addresses or derive from ScriptInfo
    const escrowAddress = providedEscrowAddress ?? escrowScript.address;
    const timelockAddress = providedTimelockAddress ?? timelockScript.address;

    // Fetch UTXOs if not provided
    let escrowInputs: UTXO[] = providedEscrowInputs || [];
    let timelockInputs: UTXO[] = providedTimelockInputs || [];

    if (!providedEscrowInputs) {
      try {
        const apiUtxos = await this.api.getAddressUtxos(escrowAddress);
        const confirmedUtxos = apiUtxos.filter(
          (apiUtxo: ApiUTXO) => apiUtxo.status?.confirmed,
        );
        escrowInputs = confirmedUtxos;
      } catch (error) {
        throw new Error(
          `Failed to fetch escrow UTXOs from ${escrowAddress}: ${(error as Error).message}`,
        );
      }
    }

    if (!providedTimelockInputs) {
      try {
        const apiUtxos = await this.api.getAddressUtxos(timelockAddress);
        const confirmedUtxos = apiUtxos.filter(
          (apiUtxo: ApiUTXO) => apiUtxo.status?.confirmed,
        );
        timelockInputs = confirmedUtxos;
      } catch (error) {
        throw new Error(
          `Failed to fetch timelock UTXOs from ${timelockAddress}: ${(error as Error).message}`,
        );
      }
    }

    // Validate that we have at least one input
    if (escrowInputs.length === 0 && timelockInputs.length === 0) {
      throw new Error(
        "No confirmed UTXOs available for withdrawal from either escrow or timelock addresses",
      );
    }

    // Calculate total values
    const escrowValue = escrowInputs.reduce(
      (sum, input) => sum + input.value,
      0,
    );
    const timelockValue = timelockInputs.reduce(
      (sum, input) => sum + input.value,
      0,
    );
    const totalInputValue = escrowValue + timelockValue;
    const totalFees = feeAmount + (protocolFeeAmount || 0);
    const destinationValue = totalInputValue - totalFees;

    if (destinationValue <= 546) {
      // Dust threshold
      throw new Error(
        "Destination output amount would be below dust threshold after fees",
      );
    }

    if (protocolFeeAmount && protocolFeeAmount < 546) {
      throw new Error(
        `Protocol fee amount ${protocolFeeAmount} is below dust threshold 546`,
      );
    }

    const psbt = new bitcoin.Psbt({ network: this.network });

    // Determine locktime from script info
    const escrowLocktime = escrowScript.locktime ?? 0;
    const timelockLocktime = timelockScript.locktime ?? 0;
    const maxLocktime = Math.max(escrowLocktime, timelockLocktime);

    // Validate time constraints
    const currentTime = Math.floor(Date.now() / 1000);
    if (escrowLocktime > 0 && currentTime < escrowLocktime) {
      throw new Error(
        `Cannot withdraw from escrow script yet. Current time: ${currentTime}, Deadline: ${escrowLocktime}. Wait until ${new Date(escrowLocktime * 1000).toISOString()}`,
      );
    }
    if (timelockLocktime > 0 && currentTime < timelockLocktime) {
      throw new Error(
        `Cannot withdraw from timelock script yet. Current time: ${currentTime}, Deadline: ${timelockLocktime}. Wait until ${new Date(timelockLocktime * 1000).toISOString()}`,
      );
    }

    // Set transaction locktime if needed
    if (maxLocktime > 0) {
      psbt.setLocktime(maxLocktime);
    }

    // Prepare tapscript spending data for escrow
    const escrowRedeemScript = Buffer.from(escrowScript.redeemScript, "hex");
    const escrowControlBlock = Buffer.from(escrowScript.controlBlock!, "hex");
    const escrowOutputScript = escrowScript.outputScript
      ? Buffer.from(escrowScript.outputScript, "hex")
      : ScriptUtils.deriveTaprootSpendInfo(escrowRedeemScript, this.network).outputScript;

    // Prepare tapscript spending data for timelock
    const timelockRedeemScript = Buffer.from(timelockScript.redeemScript, "hex");
    const timelockControlBlock = Buffer.from(timelockScript.controlBlock!, "hex");
    const timelockOutputScript = timelockScript.outputScript
      ? Buffer.from(timelockScript.outputScript, "hex")
      : ScriptUtils.deriveTaprootSpendInfo(timelockRedeemScript, this.network).outputScript;

    // Add escrow inputs with Taproot script-path data
    for (const input of escrowInputs) {
      psbt.addInput({
        hash: input.txid,
        index: input.vout,
        sequence: 0xfffffffe, // Enable locktime validation
        witnessUtxo: {
          script: escrowOutputScript,
          value: BigInt(input.value),
        },
        tapLeafScript: [
          {
            leafVersion: escrowScript.leafVersion ?? TAPROOT_LEAF_VERSION,
            script: escrowRedeemScript,
            controlBlock: escrowControlBlock,
          },
        ],
      });
    }

    // Add timelock inputs with Taproot script-path data
    for (const input of timelockInputs) {
      psbt.addInput({
        hash: input.txid,
        index: input.vout,
        sequence: 0xfffffffe, // Enable locktime validation
        witnessUtxo: {
          script: timelockOutputScript,
          value: BigInt(input.value),
        },
        tapLeafScript: [
          {
            leafVersion: timelockScript.leafVersion ?? TAPROOT_LEAF_VERSION,
            script: timelockRedeemScript,
            controlBlock: timelockControlBlock,
          },
        ],
      });
    }

    // Add destination output
    psbt.addOutput({
      address: destination,
      value: BigInt(destinationValue),
    });

    // Add protocol fee output if specified
    if (feeAddress && protocolFeeAmount && protocolFeeAmount >= 546) {
      psbt.addOutput({
        address: feeAddress,
        value: BigInt(protocolFeeAmount),
      });
    }

    // Add metadata output if specified
    if (metadata) {
      const metadataBuffer = Buffer.from(metadata, "utf8");
      const opReturnScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_RETURN,
        metadataBuffer,
      ]);
      psbt.addOutput({
        script: opReturnScript,
        value: BigInt(0),
      });
    }

    // Return unsigned PSBT
    return psbt.toBase64();
  }
}

export default DawnStakingManager;
