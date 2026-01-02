/**
 * @fileoverview Key pair generation functionality
 * @module locker/keypair
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core.js";

/**
 * Key pair generation class for Bitcoin addresses
 * @class KeyPairGenerator
 * @extends BTCLockerCore
 */
export class KeyPairGenerator extends BTCLockerCore {
  /**
   * Generate a new key pair
   * @async
   * @method generateKeyPair
   * @returns {Promise<Object>} Key pair with private key, public key, and address
   * @example
   * const generator = new KeyPairGenerator();
   * const keyPair = await generator.generateKeyPair();
   * console.log(keyPair.address);
   */
  async generateKeyPair() {
    await this.ensureInitialized();
    const { ECPair } = getECC();

    const keyPair = ECPair.makeRandom({ network: this.network });
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });

    return {
      privateKey: keyPair.privateKey.toString("hex"),
      publicKey: keyPair.publicKey.toString("hex"),
      address,
    };
  }

  /**
   * Generate key pair from existing private key
   * @async
   * @method generateKeyPairFromPrivateKey
   * @param {string} privateKeyHex - Private key in hex format (64 characters)
   * @returns {Promise<Object>} Key pair object
   * @returns {string} returns.privateKey - Private key in hex format
   * @returns {string} returns.publicKey - Public key in hex format
   * @returns {string} returns.address - Bitcoin address (P2WPKH)
   * @throws {Error} If private key is invalid
   * @example
   * const generator = new KeyPairGenerator();
   * const keyPair = await generator.generateKeyPairFromPrivateKey('1234567890abcdef...');
   * console.log(keyPair.address);
   */
  async generateKeyPairFromPrivateKey(privateKeyHex) {
    await this.ensureInitialized();
    const { ECPair } = getECC();

    const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKeyHex, "hex"), {
      network: this.network,
    });
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });

    return {
      privateKey: keyPair.privateKey.toString("hex"),
      publicKey: keyPair.publicKey.toString("hex"),
      address,
      keyPair, // Include keyPair object for signing
    };
  }
}
