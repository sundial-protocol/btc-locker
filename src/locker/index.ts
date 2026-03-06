/**
 * @fileoverview BTCLocker modular components
 */

import { BTCLockerCore } from "./core";
import { KeyPairGenerator } from "./keypair";
import { TimelockManager } from "./timelock";
import {
  TransactionManager,
  SpendingTransactionParams,
  FundingTransactionParams,
} from "./transactions";
import { YieldDistributor, YieldDistributionParams } from "./yield";
import { EscrowManager, EscrowSpendingParams } from "./escrow";
import {
  DawnStakingManager,
  DawnStakingParams,
  DawnStakingWithScriptParams,
  DawnStakingCalculationParams,
  DawnWithdrawalParams,
  DawnStakingCalculationResult,
} from "./dawn-stake";
import { KeyPair, ScriptInfo } from "../types";
import { NETWORKS, type NetworkType } from "../utils/network";
import BitcoinAPI from "../bitcoin-api";

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
  public readonly transactionManager: TransactionManager;
  public readonly yieldDistributor: YieldDistributor;
  public readonly escrowManager: EscrowManager;
  public readonly dawnStakingManager: DawnStakingManager;

  constructor(network?: NetworkType | string) {
    if (typeof network === "string" && NETWORKS[network]) {
      network = NETWORKS[network];
    } else if (!network) {
      network = NETWORKS.testnet;
    } else if (typeof network === "object" && network.info && network.name) {
      // network is already a NetworkType object, use it as-is
    } else {
      throw new Error(`Unknown network: ${network}`);
    }

    super(network);

    // Initialize component instances with the converted network object from parent
    this.keyPairGenerator = new KeyPairGenerator(network);
    this.timelockCreator = new TimelockManager(network);
    this.transactionManager = new TransactionManager(network);
    this.yieldDistributor = new YieldDistributor(network);
    this.escrowManager = new EscrowManager(network);
    this.dawnStakingManager = new DawnStakingManager(network);
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
  async createTimelockScript(
    locktime: number,
    publicKey: Buffer | string,
  ): Promise<ScriptInfo> {
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
  async createRelativeTimelockScript(
    sequence: number,
    publicKey: Buffer | string,
  ): Promise<ScriptInfo> {
    return this.timelockCreator.createRelativeTimelockScript(
      sequence,
      publicKey,
    );
  }

  /**
   * Create spending transaction for timelock scripts
   * @async
   * @param {SpendingTransactionParams} params - Transaction parameters
   * @returns {Promise<string>} Transaction hex string
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
  async createSpendingTransaction(
    params: SpendingTransactionParams,
  ): Promise<string> {
    return this.transactionManager.createSpendingTransaction(params);
  }

  /**
   * Create a funding transaction to send Bitcoin to a timelock script
   * @async
   * @param {FundingTransactionParams} params - Funding transaction parameters
   * @returns {Promise<string>} Transaction hex string
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
  async createFundingTransaction(
    params: FundingTransactionParams,
  ): Promise<string> {
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
    afterPublicKey: Buffer | string,
  ): Promise<ScriptInfo> {
    return this.escrowManager.createEscrowScript(
      deadline,
      beforePublicKey,
      afterPublicKey,
    );
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
  /**
   * Create an unsigned escrow spending transaction
   * @async
   * @param params - Escrow spending parameters
   * @returns Unsigned transaction as base64 PSBT
   * @example
   * const locker = new BTCLocker();
   * const unsignedTx = await locker.createEscrowSpendingTransaction({
   *   scriptData,
   *   utxoTxId,
   *   utxoIndex: 0,
   *   amount: 100000,
   *   outputAddress: "tb1qaddr...",
   *   spendAfterDeadline: false
   * });
   */
  async createEscrowSpendingTransaction(
    params: EscrowSpendingParams,
  ): Promise<string> {
    return this.escrowManager.createEscrowSpendingTransaction(params);
  }

  /**
   * Distribute yield back to a timelock script
   * @async
   * @param params - Distribution parameters
   * @returns Unsigned distribution transaction as base64 PSBT
   * @throws If insufficient funds or invalid parameters
   * @example
   * const locker = new BTCLocker();
   * const unsignedTx = await locker.distributeYield({
   *   inputs: [{ txid: '...', vout: 0, value: 50000 }],
   *   timelockAddress: '3...',
   *   amount: 45000,
   *   memo: 'Quarterly yield distribution'
   * });
   */
  async distributeYield(params: YieldDistributionParams): Promise<string> {
    return this.yieldDistributor.distributeYield(params);
  }

  /**
   * Create an unsigned Dawn Protocol staking transaction
   * @async
   * @param params - Dawn staking parameters
   * @returns Unsigned transaction as base64 PSBT
   * @example
   * const locker = new BTCLocker();
   * const unsignedTx = await locker.createDawnStakingTransaction({
   *   inputs: [{ txid: '...', vout: 0, value: 500000 }],
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockAddress: '3XYZ789...',
   *   timelockAmount: 200000
   * });
   */
  async createDawnStakingTransaction(
    params: DawnStakingParams,
  ): Promise<string> {
    return this.dawnStakingManager.createDawnStakingTransaction(params);
  }

  /**
   * Create an unsigned Dawn Protocol staking transaction using timelock script data
   * @async
   * @param params - Dawn staking parameters with script data
   * @returns Unsigned PSBT as base64 string
   * @example
   * const locker = new BTCLocker();
   * const timelockScript = await locker.createTimelockScript(locktime, publicKey);
   * const unsignedPsbt = await locker.createDawnStakingTransactionWithScript({
   *   inputs: [{ txid: '...', vout: 0, value: 500000 }],
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockScript: timelockScript,
   *   timelockAmount: 200000
   * });
   */
  async createDawnStakingTransactionWithScript(
    params: DawnStakingWithScriptParams,
  ): Promise<string> {
    return this.dawnStakingManager.createDawnStakingTransactionWithScript(
      params,
    );
  }

  /**
   * Calculate optimal amounts for Dawn staking
   * @async
   * @param {DawnStakingCalculationParams} params - Calculation parameters
   * @returns {Promise<DawnStakingCalculationResult>} Calculation results
   * @example
   * const locker = new BTCLocker();
   * const calculation = await locker.calculateDawnStakingAmounts({
   *   inputs: [{ value: 500000 }],
   *   desiredEscrowAmount: 100000,
   *   desiredTimelockAmount: 200000
   * });
   */
  async calculateDawnStakingAmounts(
    params: DawnStakingCalculationParams,
  ): Promise<DawnStakingCalculationResult> {
    return this.dawnStakingManager.calculateDawnStakingAmounts(params);
  }

  /**
   * Create an unsigned Dawn withdrawal transaction that combines escrow and timelock inputs
   * @async
   * @param params - Dawn withdrawal parameters
   * @returns Unsigned transaction as base64 PSBT
   * @throws If insufficient funds or invalid parameters
   * @example
   * const locker = new BTCLocker();
   * const unsignedTx = await locker.createDawnWithdrawalTransaction({
   *   escrowInputs: [{ txid: '...', vout: 0, value: 100000, redeemScript: '...' }],
   *   timelockInputs: [{ txid: '...', vout: 0, value: 200000, redeemScript: '...' }],
   *   destination: 'tb1q...',
   *   feeAmount: 2000
   * });
   */
  async createDawnWithdrawalTransaction(
    params: DawnWithdrawalParams,
  ): Promise<string> {
    return this.dawnStakingManager.createDawnWithdrawalTransaction(params);
  }

  /**
   * Check if a timelock has expired
   * @param locktime - Unix timestamp to check
   * @param currentTime - Current time (optional, defaults to now)
   * @returns True if timelock has expired
   * @example
   * const locker = new BTCLocker();
   * const expired = locker.isTimelockExpired(1640995200);
   */
  isTimelockExpired(locktime: number, currentTime?: number): boolean {
    const currentTimeSeconds = currentTime || Math.floor(Date.now() / 1000);
    return currentTimeSeconds >= locktime;
  }

  /**
   * Sign any transaction PSBT with one or more private keys
   * @async
   * @param unsignedPsbt - Unsigned PSBT in base64 format
   * @param privateKeys - Single private key or array of private keys for multiple inputs
   * @param options - Optional signing options
   * @returns Signed transaction hex
   * @throws If signing fails
   * @example
   * // Single key for all inputs
   * const signedHex = await locker.signTransaction(unsignedPsbt, privateKey);
   *
   * // Multiple keys for multiple inputs (e.g., Dawn withdrawal)
   * const signedHex = await locker.signTransaction(unsignedPsbt, [escrowKey, timelockKey]);
   *
   * // Escrow spending before deadline
   * const signedHex = await locker.signTransaction(unsignedPsbt, privateKey, { spendAfterDeadline: false });
   */
  async signTransaction(
    unsignedPsbt: string,
    privateKeys: string | string[],
    options?: { spendAfterDeadline?: boolean },
  ): Promise<string> {
    return super.signTransaction(unsignedPsbt, privateKeys, options);
  }

  /**
   * Submit any signed transaction to the Bitcoin network
   * @async
   * @param transactionHex - Signed transaction in hex format
   * @param options - Optional submission options
   * @returns Transaction ID if submitted successfully
   * @throws If submission fails
   * @example
   * const txid = await locker.submitTransaction('01000000...');
   *
   * // With API for actual broadcast
   * const txid = await locker.submitTransaction('01000000...', { api: bitcoinAPI });
   */
  async submitTransaction(
    transactionHex: string,
    options?: { api?: BitcoinAPI },
  ): Promise<string> {
    return super.submitTransaction(transactionHex, options);
  }
}

// Export all individual components for modular usage
export { BTCLockerCore } from "./core";
export { KeyPairGenerator } from "./keypair";
export { TimelockManager } from "./timelock";
export { TransactionManager } from "./transactions";
export { YieldDistributor } from "./yield";
export { EscrowManager } from "./escrow";
export { DawnStakingManager } from "./dawn-stake";

// Export type interfaces for external use
export type {
  SpendingTransactionParams,
  FundingTransactionParams,
} from "./transactions";

export type {
  DawnStakingParams,
  DawnStakingWithScriptParams,
  DawnStakingCalculationParams,
  DawnWithdrawalParams,
  DawnWithdrawalResult,
  DawnStakingResult,
  DawnStakingWithScriptResult,
} from "./dawn-stake";

export type { YieldDistributionParams, YieldDistributionResult } from "./yield";

export type { EscrowSpendingParams, EscrowSpendingTransaction } from "./escrow";

export default BTCLocker;
