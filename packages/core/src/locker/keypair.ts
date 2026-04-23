/**
 * @fileoverview Key pair generation functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core.js";
import type { KeyPair } from "../types.js";

/**
 * Key pair generation class for Bitcoin addresses
 */
export class KeyPairGenerator extends BTCLockerCore {
  /**
   * Generate a new key pair
   * @returns Key pair with private key, public key, and address
   * @example
   * const generator = new KeyPairGenerator();
   * const keyPair = await generator.generateKeyPair();
   * console.log(keyPair.address);
   */
  async generateKeyPair(): Promise<KeyPair> {
    await this.ensureInitialized();
    const { ECPair } = getECC();

    const keyPair = ECPair.makeRandom({ network: this.network });
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });

    if (!keyPair.privateKey) {
      throw new Error("Failed to generate private key");
    }

    if (!keyPair.publicKey) {
      throw new Error("Failed to generate public key");
    }

    if (!address) {
      throw new Error("Failed to generate address from key pair");
    }

    return {
      privateKey: keyPair.privateKey.toString("hex"),
      publicKey: keyPair.publicKey.toString("hex"),
      address,
    };
  }

  /**
   * Generate key pair from existing private key
   * @param privateKeyHex - Private key in hex format (64 characters)
   * @returns Key pair object
   * @throws If private key is invalid
   * @example
   * const generator = new KeyPairGenerator();
   * const keyPair = await generator.generateKeyPairFromPrivateKey('1234567890abcdef...');
   * console.log(keyPair.address);
   */
  async generateKeyPairFromPrivateKey(privateKeyHex: string): Promise<KeyPair> {
    await this.ensureInitialized();
    const { ECPair } = getECC();

    const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKeyHex, "hex"), {
      network: this.network,
    });
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });

    if (!keyPair.privateKey) {
      throw new Error("Failed to generate private key");
    }

    if (!keyPair.publicKey) {
      throw new Error("Failed to generate public key");
    }

    if (!address) {
      throw new Error("Failed to generate address from private key");
    }

    return {
      privateKey: keyPair.privateKey.toString("hex"),
      publicKey: keyPair.publicKey.toString("hex"),
      address,
    };
  }
}
