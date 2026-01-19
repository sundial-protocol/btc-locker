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
 */
export interface SpendingTransactionParams {
  inputs: UTXO[];
  outputs: Array<{
    address: string;
    value: number;
  }>;
  redeemScript: string;
  privateKeys: string[];
  locktime?: number;
}

/**
 * Parameters for creating funding transactions
 */
export interface FundingTransactionParams {
  inputs: UTXO[];
  outputs: Array<{
    address: string;
    value: number;
  }>;
  privateKey: string;
}

/**
 * Parameters for yield distribution
 */
export interface YieldDistributionParams {
  inputs: UTXO[];
  timelockAddress: string;
  amount: number;
  privateKey: string;
  memo?: string;
  changeAddress?: string;
  feeRate?: number;
}

/**
 * Result of yield distribution
 */
export interface YieldDistributionResult extends TransactionResult {
  memo: string;
  distribution: {
    amount: number;
    destination: string;
    change: number;
  };
}

/**
 * Parameters for Dawn staking transactions
 */
export interface DawnStakingParams {
  inputs: UTXO[];
  escrowAddress: string;
  escrowAmount: number;
  timelockAddress: string;
  timelockAmount: number;
  changeAddress?: string;
  privateKey: string;
  feeRate?: number;
}

/**
 * Parameters for Dawn staking with script data
 */
export interface DawnStakingWithScriptParams {
  inputs: UTXO[];
  escrowAddress: string;
  escrowAmount: number;
  timelockScript: ScriptInfo;
  timelockAmount: number;
  changeAddress?: string;
  privateKey: string;
  feeRate?: number;
}

/**
 * Parameters for Dawn staking amount calculation
 */
export interface DawnStakingCalculationParams {
  inputs: Array<{
    value: number;
  }>;
  desiredEscrowAmount: number;
  desiredTimelockAmount: number;
  includeChange?: boolean;
  feeRate?: number;
}

/**
 * Parameters for Dawn withdrawal
 */
export interface DawnWithdrawalParams {
  escrowInputs: Array<{
    txid: string;
    vout: number;
    value: number;
    redeemScript: string;
  }>;
  timelockInputs: Array<{
    txid: string;
    vout: number;
    value: number;
    redeemScript: string;
  }>;
  destination: string;
  escrowPrivateKey: string;
  timelockPrivateKey: string;
  feeAmount?: number;
}

/**
 * Result of Dawn withdrawal
 */
export interface DawnWithdrawalResult extends TransactionResult {
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