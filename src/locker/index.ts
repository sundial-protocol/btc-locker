/**
 * @fileoverview BTCLocker modular components
 */

import { BTCLockerCore } from "./core";
import { KeyPairGenerator } from "./keypair";
import { TimelockManager } from "./timelock";
import { MultisigTimelockManager } from "./multisig";
import { HodlScriptCreator } from "./hodl";
import { TransactionManager } from "./transactions";
import { YieldDistributor } from "./yield";
import { EscrowManager } from "./escrow";
import { DawnStakingManager } from "./dawn-stake";
import { 
  KeyPair, 
  ScriptInfo, 
  UTXO, 
  TransactionResult, 
  NetworkType 
} from "../types";

/**
 * Parameters for creating spending transactions
 * @interface SpendingTransactionParams
 * @description Configuration for spending from time-locked Bitcoin scripts
 */
export interface SpendingTransactionParams {
  /** Array of unspent transaction outputs to spend */
  inputs: UTXO[];
  /** Output destinations and amounts */
  outputs: Array<{
    /** Destination Bitcoin address */
    address: string;
    /** Amount to send in satoshis */
    value: number;
  }>;
  /** Redeem script in hexadecimal format */
  redeemScript: string;
  /** Private keys for signing the transaction */
  privateKeys: string[];
  /** Optional locktime for the transaction */
  locktime?: number;
}

/**
 * Parameters for creating funding transactions
 * @interface FundingTransactionParams
 * @description Configuration for creating transactions that fund Bitcoin scripts
 */
export interface FundingTransactionParams {
  /** Array of unspent transaction outputs to use as funding */
  inputs: UTXO[];
  /** Output destinations and amounts */
  outputs: Array<{
    /** Destination Bitcoin address */
    address: string;
    /** Amount to send in satoshis */
    value: number;
  }>;
  /** Private key for signing the funding transaction */
  privateKey: string;
}

/**
 * Parameters for yield distribution
 * @interface YieldDistributionParams
 * @description Configuration for distributing yield from time-locked Bitcoin funds
 */
export interface YieldDistributionParams {
  /** Array of unspent transaction outputs from timelock */
  inputs: UTXO[];
  /** Address of the timelock script */
  timelockAddress: string;
  /** Amount to distribute in satoshis */
  amount: number;
  /** Private key for signing the distribution transaction */
  privateKey: string;
  /** Optional memo for the distribution */
  memo?: string;
  /** Optional change address for remaining funds */
  changeAddress?: string;
  /** Optional fee rate in satoshis per byte */
  feeRate?: number;
}

/**
 * Result of yield distribution
 * @interface YieldDistributionResult
 * @description Transaction result with additional yield distribution metadata
 * @extends TransactionResult
 */
export interface YieldDistributionResult extends TransactionResult {
  /** Memo associated with the yield distribution */
  memo: string;
  /** Distribution details */
  distribution: {
    /** Amount distributed in satoshis */
    amount: number;
    /** Destination address for the distribution */
    destination: string;
    /** Change amount in satoshis */
    change: number;
  };
}

/**
 * Parameters for Dawn staking transactions
 * @interface DawnStakingParams
 * @description Configuration for creating Dawn protocol staking transactions with dual outputs
 */
export interface DawnStakingParams {
  /** Array of unspent transaction outputs to stake */
  inputs: UTXO[];
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
  /** Private key for signing the staking transaction */
  privateKey: string;
  /** Optional fee rate in satoshis per byte */
  feeRate?: number;
}

/**
 * Parameters for Dawn staking with script data
 * @interface DawnStakingWithScriptParams
 * @description Configuration for creating Dawn staking transactions with provided timelock script information
 */
export interface DawnStakingWithScriptParams {
  /** Array of unspent transaction outputs to stake */
  inputs: UTXO[];
  /** Escrow script address */
  escrowAddress: string;
  /** Amount to send to escrow in satoshis */
  escrowAmount: number;
  /** Timelock script information object */
  timelockScript: ScriptInfo;
  /** Amount to send to timelock in satoshis */
  timelockAmount: number;
  /** Optional change address for remaining funds */
  changeAddress?: string;
  /** Private key for signing the staking transaction */
  privateKey: string;
  /** Optional fee rate in satoshis per byte */
  feeRate?: number;
}

/**
 * Parameters for Dawn staking amount calculation
 * @interface DawnStakingCalculationParams
 * @description Configuration for calculating optimal Dawn staking amounts and fees
 */
export interface DawnStakingCalculationParams {
  /** Array of available inputs with their values */
  inputs: Array<{
    /** Input value in satoshis */
    value: number;
  }>;
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
 * Parameters for Dawn withdrawal
 * @interface DawnWithdrawalParams
 * @description Configuration for withdrawing from both escrow and timelock Dawn staking outputs
 */
export interface DawnWithdrawalParams {
  /** Array of escrow inputs to withdraw from */
  escrowInputs: Array<{
    /** Transaction ID */
    txid: string;
    /** Output index */
    vout: number;
    /** Output value in satoshis */
    value: number;
    /** Redeem script in hexadecimal format */
    redeemScript: string;
  }>;
  /** Array of timelock inputs to withdraw from */
  timelockInputs: Array<{
    /** Transaction ID */
    txid: string;
    /** Output index */
    vout: number;
    /** Output value in satoshis */
    value: number;
    /** Redeem script in hexadecimal format */
    redeemScript: string;
  }>;
  /** Destination address for withdrawn funds */
  destination: string;
  /** Private key for signing escrow inputs */
  escrowPrivateKey: string;
  /** Private key for signing timelock inputs */
  timelockPrivateKey: string;
  /** Optional fixed fee amount in satoshis */
  feeAmount?: number;
}

/**
 * Result of Dawn withdrawal
 * @interface DawnWithdrawalResult
 * @description Transaction result with detailed input and output information for Dawn withdrawal
 * @extends TransactionResult
 */
export interface DawnWithdrawalResult extends TransactionResult {
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
 * Combined BTCLocker class that includes all functionality
 * @class BTCLocker
 * @description Main interface class that combines all BTC Locker functionality in a single class
 * while maintaining backward compatibility with the original monolithic implementation
 * @param {string|Object} [network] - Bitcoin network ('bitcoin', 'testnet', 'regtest') or network object
 * @example
 * // Using string network name
 * const locker = new BTCLocker('testnet');
 * await locker.init();
 *
 * // Using network object
 * const locker = new BTCLocker(bitcoin.networks.testnet);
 * await locker.init();
 */
export class BTCLocker extends BTCLockerCore {
  public readonly keyPairGenerator: KeyPairGenerator;
  public readonly timelockCreator: TimelockManager;
  public readonly multisigCreator: MultisigTimelockManager;
  public readonly hodlCreator: HodlScriptCreator;
  public readonly transactionManager: TransactionManager;
  public readonly yieldDistributor: YieldDistributor;
  public readonly escrowManager: EscrowManager;
  public readonly dawnStakingManager: DawnStakingManager;

  constructor(network?: NetworkType) {
    super(network);

    // Initialize component instances with the converted network object from parent
    this.keyPairGenerator = new KeyPairGenerator(this.network);
    this.timelockCreator = new TimelockManager(this.network);
    this.multisigCreator = new MultisigTimelockManager(this.network);
    this.hodlCreator = new HodlScriptCreator(this.network);
    this.transactionManager = new TransactionManager(this.network);
    this.yieldDistributor = new YieldDistributor(this.network);
    this.escrowManager = new EscrowManager(this.network);
    this.dawnStakingManager = new DawnStakingManager(this.network);
  }

  /**
   * Initialize the BTCLocker and all its components
   * @async
   * @returns {Promise<void>} Promise that resolves when all components are initialized
   * @throws {Error} If any component fails to initialize
   * @example
   * const locker = new BTCLocker();
   * await locker.init();
   */
  async init(): Promise<void> {
    await super.init();
    // Initialize all components
    await Promise.all([
      this.keyPairGenerator.init(),
      this.timelockCreator.init(),
      this.multisigCreator.init(),
      this.hodlCreator.init(),
      this.transactionManager.init(),
      this.yieldDistributor.init(),
      this.escrowManager.init(),
      this.dawnStakingManager.init(),
    ]);
  }

  // Delegate methods to appropriate components

  /**
   * Generate a new Bitcoin key pair
   * @async
   * @returns {Promise<KeyPair>} Key pair object
   * @throws {Error} If key generation fails
   * @example
   * const locker = new BTCLocker();
   * const keyPair = await locker.generateKeyPair();
   * console.log(keyPair.address);
   */
  async generateKeyPair(): Promise<KeyPair> {
    return this.keyPairGenerator.generateKeyPair();
  }

  /**
   * Generate key pair from existing private key
   * @async
   * @param {string} privateKeyHex - Private key in hex format (64 characters)
   * @returns {Promise<KeyPair>} Key pair object
   * @throws {Error} If private key is invalid
   * @example
   * const locker = new BTCLocker();
   * const keyPair = await locker.generateKeyPairFromPrivateKey('1234567890abcdef...');
   * console.log(keyPair.address);
   */
  async generateKeyPairFromPrivateKey(privateKeyHex: string): Promise<KeyPair> {
    return this.keyPairGenerator.generateKeyPairFromPrivateKey(privateKeyHex);
  }

  /**
   * Create a simple timelock script (absolute time)
   * @async
   * @param {number} locktime - Unix timestamp (for time-based) or block height (for height-based)
   * @param {Buffer|string} publicKey - Public key as buffer or hex string
   * @returns {Promise<ScriptInfo>} Script details object
   * @throws {Error} If locktime or publicKey is invalid
   * @example
   * const locker = new BTCLocker();
   * const script = await locker.createTimelockScript(1640995200, publicKey);
   * console.log(script.address);
   */
  async createTimelockScript(locktime: number, publicKey: Buffer | string): Promise<ScriptInfo> {
    return this.timelockCreator.createTimelockScript(locktime, publicKey);
  }

  /**
   * Create a relative timelock script (CSV - CheckSequenceVerify)
   * @async
   * @param {number} sequence - Relative timelock value (blocks or time units)
   * @param {Buffer|string} publicKey - Public key as buffer or hex string
   * @returns {Promise<ScriptInfo>} Script details object
   * @throws {Error} If sequence or publicKey is invalid
   * @example
   * const locker = new BTCLocker();
   * const script = await locker.createRelativeTimelockScript(144, publicKey); // 1 day
   * console.log(script.address);
   */
  async createRelativeTimelockScript(sequence: number, publicKey: Buffer | string): Promise<ScriptInfo> {
    return this.timelockCreator.createRelativeTimelockScript(
      sequence,
      publicKey
    );
  }

  /**
   * Create a multisig timelock script
   * @async
   * @param {number} locktime - Unix timestamp or block height for timelock
   * @param {number} m - Required number of signatures (M-of-N multisig)
   * @param {Array<Buffer|string>} publicKeys - Array of public keys (buffers or hex strings)
   * @returns {Promise<ScriptInfo>} Script details object
   * @throws {Error} If parameters are invalid or insufficient public keys provided
   * @example
   * const locker = new BTCLocker();
   * const script = await locker.createMultisigTimelockScript(
   *   1640995200, // locktime
   *   2,           // require 2 signatures
   *   [pubKey1, pubKey2, pubKey3] // 3 total keys
   * );
   * console.log(script.address);
   */
  async createMultisigTimelockScript(
    locktime: number, 
    m: number, 
    publicKeys: Array<Buffer | string>
  ): Promise<ScriptInfo> {
    return this.multisigCreator.createMultisigTimelockScript(
      locktime,
      m,
      publicKeys
    );
  }

  /**
   * Create a HODL script with emergency escape mechanism
   * @async
   * @param {number} locktime - Unix timestamp or block height for the HODL period
   * @param {Buffer|string} ownerPubKey - Owner's public key (normal spending after locktime)
   * @param {Buffer|string} penaltyPubKey - Emergency escape public key (immediate spending)
   * @returns {Promise<ScriptInfo>} Script details object
   * @throws {Error} If parameters are invalid
   * @example
   * const locker = new BTCLocker();
   * const script = await locker.createHodlScript(
   *   1640995200,    // locktime
   *   ownerPubKey,   // normal spending key
   *   escapePubKey   // emergency escape key
   * );
   * console.log(script.address);
   */
  async createHodlScript(
    locktime: number, 
    ownerPubKey: Buffer | string, 
    penaltyPubKey: Buffer | string
  ): Promise<ScriptInfo> {
    return this.hodlCreator.createHodlScript(
      locktime,
      ownerPubKey,
      penaltyPubKey
    );
  }

  /**
   * Create spending transaction for timelock scripts
   * @async
   * @param {SpendingTransactionParams} params - Transaction parameters
   * @returns {Promise<TransactionResult>} Transaction details object
   * @throws {Error} If timelock hasn't expired or parameters are invalid
   * @example
   * const locker = new BTCLocker();
   * const tx = await locker.createSpendingTransaction({
   *   inputs: [{ txid: '...', vout: 0, value: 100000 }],
   *   outputs: [{ address: '...', value: 95000 }],
   *   redeemScript: '...',
   *   privateKeys: ['...']
   * });
   */
  async createSpendingTransaction(params: SpendingTransactionParams): Promise<TransactionResult> {
    return this.transactionManager.createSpendingTransaction(params);
  }

  /**
   * Create a funding transaction to send Bitcoin to a timelock script
   * @async
   * @param {FundingTransactionParams} params - Funding transaction parameters
   * @returns {Promise<TransactionResult>} Transaction details object
   * @throws {Error} If insufficient funds or invalid parameters
   * @example
   * const locker = new BTCLocker();
   * const tx = await locker.createFundingTransaction({
   *   inputs: [{ txid: '...', vout: 0, value: 200000 }],
   *   timelockAddress: '3...',
   *   amount: 100000,
   *   changeAddress: '1...',
   *   privateKeys: ['...']
   * });
   */
  async createFundingTransaction(params: FundingTransactionParams): Promise<TransactionResult> {
    return this.transactionManager.createFundingTransaction(params);
  }

  /**
   * Create a time-based escrow script
   * @async
   * @param {number} deadline - Unix timestamp deadline
   * @param {Buffer|string} beforePublicKey - Public key of user who can withdraw before deadline
   * @param {Buffer|string} afterPublicKey - Public key of user who can withdraw after deadline
   * @returns {Promise<ScriptInfo>} Script details object
   * @throws {Error} If deadline or public keys are invalid
   * @example
   * const locker = new BTCLocker();
   * const script = await locker.createEscrowScript(
   *   1640995200,
   *   userAPublicKey,
   *   userBPublicKey
   * );
   * console.log(script.address);
   */
  async createEscrowScript(
    deadline: number, 
    beforePublicKey: Buffer | string, 
    afterPublicKey: Buffer | string
  ): Promise<ScriptInfo> {
    return this.escrowManager.createEscrowScript(deadline, beforePublicKey, afterPublicKey);
  }

  /**
   * Create a spending transaction for the escrow script
   * @async
   * @param {ScriptInfo} scriptData - Script data returned from createEscrowScript
   * @param {string} utxoTxId - Transaction ID of the UTXO to spend
   * @param {number} utxoIndex - Output index of the UTXO to spend
   * @param {number} amount - Amount in satoshis to spend
   * @param {string} outputAddress - Address to send funds to
   * @param {boolean} spendAfterDeadline - Whether to spend after deadline (true) or before (false)
   * @param {Buffer|string} privateKey - Private key corresponding to the appropriate public key
   * @param {number} [currentTime] - Current time for validation (defaults to Date.now())
   * @returns {Promise<{ txHex: string; txId: string }>} Transaction details
   * @throws {Error} If spending conditions are not met or transaction creation fails
   * @example
   * const locker = new BTCLocker();
   * // Spend before deadline
   * const tx = await locker.createEscrowSpendingTransaction(
   *   scriptData,
   *   utxoTxId,
   *   0,
   *   100000,
   *   "tb1qaddr...",
   *   false,
   *   beforeUserPrivateKey
   * );
   */
  async createEscrowSpendingTransaction(
    scriptData: ScriptInfo,
    utxoTxId: string,
    utxoIndex: number,
    amount: number,
    outputAddress: string,
    spendAfterDeadline: boolean,
    privateKey: Buffer | string,
    currentTime?: number
  ): Promise<{ txHex: string; txId: string }> {
    return this.escrowManager.createEscrowSpendingTransaction(
      scriptData,
      utxoTxId,
      utxoIndex,
      amount,
      outputAddress,
      spendAfterDeadline,
      privateKey,
      currentTime
    );
  }

  /**
   * Distribute yield back to a timelock script
   * @async
   * @param {YieldDistributionParams} params - Distribution parameters
   * @returns {Promise<YieldDistributionResult>} Signed distribution transaction object
   * @throws {Error} If insufficient funds or invalid parameters
   * @example
   * const locker = new BTCLocker();
   * const tx = await locker.distributeYield({
   *   inputs: [{ txid: '...', vout: 0, value: 50000 }],
   *   timelockAddress: '3...',
   *   amount: 45000,
   *   privateKey: '...',
   *   memo: 'Quarterly yield distribution'
   * });
   */
  async distributeYield(params: YieldDistributionParams): Promise<YieldDistributionResult> {
    return this.yieldDistributor.distributeYield(params);
  }

  /**
   * Create a Dawn Protocol staking transaction
   * @async
   * @param {DawnStakingParams} params - Dawn staking parameters
   * @returns {Promise<TransactionResult>} Dawn staking transaction details
   * @example
   * const locker = new BTCLocker();
   * const tx = await locker.createDawnStakingTransaction({
   *   inputs: [{ txid: '...', vout: 0, value: 500000 }],
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockAddress: '3XYZ789...',
   *   timelockAmount: 200000,
   *   privateKey: '...'
   * });
   */
  async createDawnStakingTransaction(params: DawnStakingParams): Promise<TransactionResult> {
    return this.dawnStakingManager.createDawnStakingTransaction(params);
  }

  /**
   * Create a Dawn Protocol staking transaction using timelock script data
   * @async
   * @param {DawnStakingWithScriptParams} params - Dawn staking parameters with script data
   * @returns {Promise<TransactionResult>} Dawn staking transaction details with script info
   * @example
   * const locker = new BTCLocker();
   * const timelockScript = await locker.createTimelockScript(locktime, publicKey);
   * const tx = await locker.createDawnStakingTransactionWithScript({
   *   inputs: [{ txid: '...', vout: 0, value: 500000 }],
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockScript: timelockScript,
   *   timelockAmount: 200000,
   *   privateKey: '...'
   * });
   */
  async createDawnStakingTransactionWithScript(params: DawnStakingWithScriptParams): Promise<TransactionResult> {
    return this.dawnStakingManager.createDawnStakingTransactionWithScript(params);
  }

  /**
   * Calculate optimal amounts for Dawn staking
   * @async
   * @param {DawnStakingCalculationParams} params - Calculation parameters
   * @returns {Promise<any>} Calculation results
   * @example
   * const locker = new BTCLocker();
   * const calculation = await locker.calculateDawnStakingAmounts({
   *   inputs: [{ value: 500000 }],
   *   desiredEscrowAmount: 100000,
   *   desiredTimelockAmount: 200000
   * });
   */
  async calculateDawnStakingAmounts(params: DawnStakingCalculationParams): Promise<any> {
    return this.dawnStakingManager.calculateDawnStakingAmounts(params);
  }

  /**
   * Create a Dawn withdrawal transaction that combines escrow and timelock inputs into a single output
   * @async
   * @param {DawnWithdrawalParams} params - Dawn withdrawal parameters
   * @returns {Promise<DawnWithdrawalResult>} Dawn withdrawal transaction details
   * @throws {Error} If insufficient funds or invalid parameters
   * @example
   * const locker = new BTCLocker();
   * const tx = await locker.createDawnWithdrawalTransaction({
   *   escrowInputs: [{ txid: '...', vout: 0, value: 100000, redeemScript: '...' }],
   *   timelockInputs: [{ txid: '...', vout: 0, value: 200000, redeemScript: '...' }],
   *   destination: 'tb1q...',
   *   escrowPrivateKey: '...',
   *   timelockPrivateKey: '...',
   *   feeAmount: 2000
   * });
   */
  async createDawnWithdrawalTransaction(params: DawnWithdrawalParams): Promise<DawnWithdrawalResult> {
    return this.dawnStakingManager.createDawnWithdrawalTransaction(params);
  }
}

// Export all individual components for modular usage
export { BTCLockerCore } from "./core";
export { KeyPairGenerator } from "./keypair";
export { TimelockManager } from "./timelock";
export { MultisigTimelockManager } from "./multisig";
export { HodlScriptCreator } from "./hodl";
export { TransactionManager } from "./transactions";
export { YieldDistributor } from "./yield";
export { EscrowManager } from "./escrow";
export { DawnStakingManager } from "./dawn-stake";

export default BTCLocker;