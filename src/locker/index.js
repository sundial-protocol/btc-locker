/**
 * @fileoverview BTCLocker modular components
 * @module locker
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
 * @extends BTCLockerCore
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

  // Key pair methods
  async generateKeyPair() {
    return this.keyPairGenerator.generateKeyPair();
  }

  async generateKeyPairFromPrivateKey(privateKeyHex) {
    return this.keyPairGenerator.generateKeyPairFromPrivateKey(privateKeyHex);
  }

  // Timelock script methods
  async createTimelockScript(locktime, publicKey) {
    return this.timelockCreator.createTimelockScript(locktime, publicKey);
  }

  async createRelativeTimelockScript(sequence, publicKey) {
    return this.timelockCreator.createRelativeTimelockScript(
      sequence,
      publicKey
    );
  }

  // Multisig methods
  async createMultisigTimelockScript(locktime, m, publicKeys) {
    return this.multisigCreator.createMultisigTimelockScript(
      locktime,
      m,
      publicKeys
    );
  }

  // HODL script methods
  async createHodlScript(locktime, ownerPubKey, penaltyPubKey) {
    return this.hodlCreator.createHodlScript(
      locktime,
      ownerPubKey,
      penaltyPubKey
    );
  }

  // Transaction methods
  async createSpendingTransaction(params) {
    return this.transactionManager.createSpendingTransaction(params);
  }

  async createFundingTransaction(params) {
    return this.transactionManager.createFundingTransaction(params);
  }

  // Yield distribution methods
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
