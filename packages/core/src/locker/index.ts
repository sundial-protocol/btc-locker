/**
 * @fileoverview BTCLocker modular components
 */

import { BTCLockerCore } from "./core.js";
import { KeyPairGenerator } from "./keypair.js";
import { TransactionManager } from "./transaction-manager.js";
import { ScriptManager } from "./script-manager.js";
import {
  DepositParams,
  DepositWithScriptParams,
  DepositCalculationParams,
  WithdrawalParams,
  DepositCalculationResult,
  ClaimParams,
  SpendingTransactionParams,
  FundingTransactionParams,
} from "./transactions/index.js";
import { KeyPair, ScriptInfo } from "../types.js";
import { NETWORKS, type NetworkType } from "../utils/network.js";
import BitcoinAPI from "../bitcoin-api.js";
import { DistributionParams } from "../index.js";

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
  public readonly transactionManager: TransactionManager;
  public readonly scriptManager: ScriptManager;

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
    this.transactionManager = new TransactionManager(network);
    this.scriptManager = new ScriptManager(network);
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
      this.transactionManager.init(),
      this.scriptManager.init(),
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
    return this.scriptManager.createTimelockScript(locktime, publicKey);
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
    return this.scriptManager.createRelativeTimelockScript(sequence, publicKey);
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
    return this.scriptManager.createEscrowScript(
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
   * const tx = await locker.createClaimTransaction(
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
   * const unsignedTx = await locker.createClaimTransaction({
   *   scriptData,
   *   utxoTxId,
   *   utxoIndex: 0,
   *   amount: 100000,
   *   outputAddress: "tb1qaddr...",
   *   spendAfterDeadline: false
   * });
   */
  async createClaimTransaction(params: ClaimParams): Promise<string> {
    return this.transactionManager.createClaimTransaction(params);
  }

  /**
   * Distribute yield back to a timelock script
   * @async
   * @param params - Distribution parameters
   * @returns Unsigned distribution transaction as base64 PSBT
   * @throws If insufficient funds or invalid parameters
   * @example
   * const locker = new BTCLocker();
   * const unsignedTx = await locker.createDistributionTransaction({
   *   inputs: [{ txid: '...', vout: 0, value: 50000 }],
   *   timelockAddress: '3...',
   *   amount: 45000,
   *   memo: 'Quarterly yield distribution'
   * });
   */
  async createDistributionTransaction(
    params: DistributionParams,
  ): Promise<string> {
    return this.transactionManager.createDistributionTransaction(params);
  }

  /**
   * Create an unsigned Dawn Protocol staking transaction
   * @async
   * @param params - Dawn staking parameters
   * @returns Unsigned transaction as base64 PSBT
   * @example
   * const locker = new BTCLocker();
   * const unsignedTx = await locker.createDepositTransaction({
   *   inputs: [{ txid: '...', vout: 0, value: 500000 }],
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockAddress: '3XYZ789...',
   *   timelockAmount: 200000
   * });
   */
  async createDepositTransaction(params: DepositParams): Promise<string> {
    return this.transactionManager.createDepositTransaction(params);
  }

  /**
   * Create an unsigned Dawn Protocol staking transaction using timelock script data
   * @async
   * @param params - Dawn staking parameters with script data
   * @returns Unsigned PSBT as base64 string
   * @example
   * const locker = new BTCLocker();
   * const timelockScript = await locker.createTimelockScript(locktime, publicKey);
   * const unsignedPsbt = await locker.createDepositTransactionWithScript({
   *   inputs: [{ txid: '...', vout: 0, value: 500000 }],
   *   escrowAddress: '3ABC123...',
   *   escrowAmount: 100000,
   *   timelockScript: timelockScript,
   *   timelockAmount: 200000
   * });
   */
  async createDepositTransactionWithScript(
    params: DepositWithScriptParams,
  ): Promise<string> {
    return this.transactionManager.createDepositTransactionWithScript(params);
  }

  /**
   * Calculate optimal amounts for Dawn staking
   * @async
   * @param {DepositCalculationParams} params - Calculation parameters
   * @returns {Promise<DepositCalculationResult>} Calculation results
   * @example
   * const locker = new BTCLocker();
   * const calculation = await locker.calculateDepositAmounts({
   *   inputs: [{ value: 500000 }],
   *   desiredEscrowAmount: 100000,
   *   desiredTimelockAmount: 200000
   * });
   */
  async calculateDepositAmounts(
    params: DepositCalculationParams,
  ): Promise<DepositCalculationResult> {
    return this.transactionManager.calculateDepositAmounts(params);
  }

  /**
   * Create an unsigned Dawn withdrawal transaction that combines escrow and timelock inputs
   * @async
   * @param params - Dawn withdrawal parameters
   * @returns Unsigned transaction as base64 PSBT
   * @throws If insufficient funds or invalid parameters
   * @example
   * const locker = new BTCLocker();
   * const unsignedTx = await locker.createWithdrawalTransaction({
   *   escrowInputs: [{ txid: '...', vout: 0, value: 100000, redeemScript: '...' }],
   *   timelockInputs: [{ txid: '...', vout: 0, value: 200000, redeemScript: '...' }],
   *   destination: 'tb1q...',
   *   feeAmount: 2000
   * });
   */
  async createWithdrawalTransaction(params: WithdrawalParams): Promise<string> {
    return this.transactionManager.createWithdrawalTransaction(params);
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
export { BTCLockerCore } from "./core.js";
export { KeyPairGenerator } from "./keypair.js";
export { TransactionManager } from "./transaction-manager.js";
export { ScriptManager } from "./script-manager.js";

// Export type interfaces for external use
export type {
  SpendingTransactionParams,
  FundingTransactionParams,
} from "./transactions/index.js";

export type {
  DepositParams,
  DepositWithScriptParams,
  DepositCalculationParams,
  WithdrawalParams,
  ClaimParams,
} from "./transactions/index.js";

export type { DistributionParams } from "./transactions/index.js";

export default BTCLocker;
