/**
 * @fileoverview BTCLocker modular components
 */

import { BTCLockerCore } from "./core.js";
import { KeyPairGenerator } from "./keypair.js";
import { TimelockManager } from "./timelock.js";
import { MultisigTimelockManager } from "./multisig.js";
import { HodlScriptCreator } from "./hodl.js";
import { TransactionManager } from "./transactions.js";
import { YieldDistributor } from "./yield.js";

/**
 * Combined BTCLocker class that includes all functionality
 * @class BTCLocker
 * @description Main interface class that combines all BTC Locker functionality in a single class
 * while maintaining backward compatibility with the original monolithic implementation
 */
export class BTCLocker extends BTCLockerCore {
  constructor(network) {
    super(network);

    // Initialize component instances with the same network
    this.keyPairGenerator = new KeyPairGenerator(network);
    this.timelockCreator = new TimelockManager(network);
    this.multisigCreator = new MultisigTimelockManager(network);
    this.hodlCreator = new HodlScriptCreator(network);
    this.transactionManager = new TransactionManager(network);
    this.yieldDistributor = new YieldDistributor(network);
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
  async init() {
    await super.init();
    // Initialize all components
    await Promise.all([
      this.keyPairGenerator.init(),
      this.timelockCreator.init(),
      this.multisigCreator.init(),
      this.hodlCreator.init(),
      this.transactionManager.init(),
      this.yieldDistributor.init(),
    ]);
  }

  // Delegate methods to appropriate components

  /**
   * Generate a new Bitcoin key pair
   * @async
   * @returns {Promise<Object>} Key pair object
   * @returns {string} returns.privateKey - Private key in hex format
   * @returns {string} returns.publicKey - Public key in hex format
   * @returns {string} returns.address - Bitcoin address (P2WPKH)
   * @throws {Error} If key generation fails
   * @example
   * const locker = new BTCLocker();
   * const keyPair = await locker.generateKeyPair();
   * console.log(keyPair.address);
   */
  async generateKeyPair() {
    return this.keyPairGenerator.generateKeyPair();
  }

  /**
   * Generate key pair from existing private key
   * @async
   * @param {string} privateKeyHex - Private key in hex format (64 characters)
   * @returns {Promise<Object>} Key pair object
   * @returns {string} returns.privateKey - Private key in hex format
   * @returns {string} returns.publicKey - Public key in hex format
   * @returns {string} returns.address - Bitcoin address (P2WPKH)
   * @throws {Error} If private key is invalid
   * @example
   * const locker = new BTCLocker();
   * const keyPair = await locker.generateKeyPairFromPrivateKey('1234567890abcdef...');
   * console.log(keyPair.address);
   */
  async generateKeyPairFromPrivateKey(privateKeyHex) {
    return this.keyPairGenerator.generateKeyPairFromPrivateKey(privateKeyHex);
  }

  /**
   * Create a simple timelock script (absolute time)
   * @async
   * @param {number} locktime - Unix timestamp (for time-based) or block height (for height-based)
   * @param {Buffer|string} publicKey - Public key as buffer or hex string
   * @returns {Promise<Object>} Script details object
   * @returns {Buffer} returns.script - The compiled timelock script
   * @returns {string} returns.scriptHex - Script in hex format
   * @returns {string} returns.address - P2SH address for the script
   * @returns {string} returns.redeemScript - Redeem script in hex format
   * @returns {number} returns.locktime - The locktime value
   * @throws {Error} If locktime or publicKey is invalid
   * @example
   * const locker = new BTCLocker();
   * const script = await locker.createTimelockScript(1640995200, publicKey);
   * console.log(script.address);
   */
  async createTimelockScript(locktime, publicKey) {
    return this.timelockCreator.createTimelockScript(locktime, publicKey);
  }

  /**
   * Create a relative timelock script (CSV - CheckSequenceVerify)
   * @async
   * @param {number} sequence - Relative timelock value (blocks or time units)
   * @param {Buffer|string} publicKey - Public key as buffer or hex string
   * @returns {Promise<Object>} Script details object
   * @returns {Buffer} returns.script - The compiled timelock script
   * @returns {string} returns.scriptHex - Script in hex format
   * @returns {string} returns.address - P2SH address for the script
   * @returns {string} returns.redeemScript - Redeem script in hex format
   * @returns {number} returns.sequence - The sequence value
   * @throws {Error} If sequence or publicKey is invalid
   * @example
   * const locker = new BTCLocker();
   * const script = await locker.createRelativeTimelockScript(144, publicKey); // 1 day
   * console.log(script.address);
   */
  async createRelativeTimelockScript(sequence, publicKey) {
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
   * @returns {Promise<Object>} Script details object
   * @returns {Buffer} returns.script - The compiled multisig timelock script
   * @returns {string} returns.scriptHex - Script in hex format
   * @returns {string} returns.address - P2SH address for the script
   * @returns {string} returns.redeemScript - Redeem script in hex format
   * @returns {number} returns.locktime - The locktime value
   * @returns {number} returns.m - Required signatures count
   * @returns {number} returns.n - Total public keys count
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
  async createMultisigTimelockScript(locktime, m, publicKeys) {
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
   * @returns {Promise<Object>} Script details object
   * @returns {Buffer} returns.script - The compiled HODL script with conditional logic
   * @returns {string} returns.scriptHex - Script in hex format
   * @returns {string} returns.address - P2SH address for the script
   * @returns {string} returns.redeemScript - Redeem script in hex format
   * @returns {number} returns.locktime - The locktime value
   * @returns {string} returns.ownerPubKey - Owner public key in hex
   * @returns {string} returns.penaltyPubKey - Penalty public key in hex
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
  async createHodlScript(locktime, ownerPubKey, penaltyPubKey) {
    return this.hodlCreator.createHodlScript(
      locktime,
      ownerPubKey,
      penaltyPubKey
    );
  }

  /**
   * Create spending transaction for timelock scripts
   * @async
   * @param {Object} params - Transaction parameters
   * @param {Array<Object>} params.inputs - Input UTXOs array
   * @param {string} params.inputs[].txid - Transaction ID of the UTXO
   * @param {number} params.inputs[].vout - Output index of the UTXO
   * @param {number} params.inputs[].value - Value in satoshis
   * @param {Array<Object>} params.outputs - Output destinations array
   * @param {string} params.outputs[].address - Destination address
   * @param {number} params.outputs[].value - Amount in satoshis
   * @param {string} params.redeemScript - Redeem script in hex format
   * @param {Array<string>} params.privateKeys - Private keys for signing (hex format)
   * @param {number} [params.locktime] - Transaction locktime (optional)
   * @returns {Promise<Object>} Transaction details object
   * @returns {string} returns.hex - Signed transaction hex
   * @returns {string} returns.txid - Transaction ID
   * @returns {number} returns.size - Transaction size in bytes
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
  async createSpendingTransaction(params) {
    return this.transactionManager.createSpendingTransaction(params);
  }

  /**
   * Create a funding transaction to send Bitcoin to a timelock script
   * @async
   * @param {Object} params - Funding transaction parameters
   * @param {Array<Object>} params.inputs - Input UTXOs to spend from
   * @param {string} params.inputs[].txid - Transaction ID of the UTXO
   * @param {number} params.inputs[].vout - Output index of the UTXO
   * @param {number} params.inputs[].value - Value in satoshis
   * @param {string} params.timelockAddress - Address of the timelock script
   * @param {number} params.amount - Amount to send to timelock (satoshis)
   * @param {string} params.changeAddress - Address for change output
   * @param {Array<string>} params.privateKeys - Private keys for signing inputs
   * @param {number} [params.feeRate=10] - Fee rate in sat/byte
   * @returns {Promise<Object>} Transaction details object
   * @returns {string} returns.hex - Signed transaction hex
   * @returns {string} returns.txid - Transaction ID
   * @returns {number} returns.fee - Transaction fee in satoshis
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
  async createFundingTransaction(params) {
    return this.transactionManager.createFundingTransaction(params);
  }

  /**
   * Distribute yield back to a timelock script
   * @async
   * @param {Object} params - Distribution parameters
   * @param {Array<Object>} params.inputs - Input UTXOs from yield source
   * @param {string} params.inputs[].txid - Transaction ID of the UTXO
   * @param {number} params.inputs[].vout - Output index of the UTXO
   * @param {number} params.inputs[].value - Value in satoshis
   * @param {string} params.timelockAddress - Timelock script address to send yield to
   * @param {number} params.amount - Amount to distribute in satoshis
   * @param {string} params.privateKey - Private key for signing inputs (hex format)
   * @param {string} [params.memo] - Optional memo for the distribution
   * @param {string} [params.changeAddress] - Change address (defaults to derived from private key)
   * @param {number} [params.feeRate=10] - Fee rate in sat/byte
   * @returns {Promise<Object>} Signed distribution transaction object
   * @returns {string} returns.hex - Signed transaction hex
   * @returns {string} returns.txid - Transaction ID
   * @returns {number} returns.fee - Transaction fee in satoshis
   * @returns {string} [returns.memo] - Memo if provided
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
  async distributeYield(params) {
    return this.yieldDistributor.distributeYield(params);
  }
}

// Export all individual components for modular usage
export { BTCLockerCore } from "./core.js";
export { KeyPairGenerator } from "./keypair.js";
export { TimelockManager } from "./timelock.js";
export { MultisigTimelockManager } from "./multisig.js";
export { HodlScriptCreator } from "./hodl.js";
export { TransactionManager } from "./transactions.js";
export { YieldDistributor } from "./yield.js";

export default BTCLocker;
