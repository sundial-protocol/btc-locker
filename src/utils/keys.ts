/**
 * @fileoverview Shared transaction utilities to eliminate code duplication
 */

import * as bitcoin from "bitcoinjs-lib";
import { ECPairInterface } from "ecpair";

/**
 * Key validation and conversion utilities
 */
export default class KeyUtils {
  /**
   * Validate and convert public key to Buffer
   * @param publicKey - Public key as string or Buffer
   * @param paramName - Parameter name for error messages
   * @returns Public key as Buffer
   * @throws If public key is invalid
   */
  static validateAndConvertPublicKey(publicKey: Buffer | string, paramName: string = "publicKey"): Buffer {
    if (publicKey === undefined || publicKey === null) {
      throw new Error(`${paramName} cannot be undefined or null`);
    }

    let publicKeyBuffer: Buffer;
    
    if (typeof publicKey === "string") {
      if (!/^[0-9a-fA-F]+$/.test(publicKey)) {
        throw new Error(`${paramName} string must contain only hexadecimal characters`);
      }
      try {
        publicKeyBuffer = Buffer.from(publicKey, "hex");
      } catch (error) {
        throw new Error(`Invalid ${paramName} hex string: ${(error as Error).message}`);
      }
    } else if (Buffer.isBuffer(publicKey)) {
      publicKeyBuffer = publicKey;
    } else {
      throw new Error(`${paramName} must be a string or Buffer`);
    }

    // Validate public key length (33/65 for ECDSA, 32 for x-only Taproot)
    if (publicKeyBuffer.length !== 32 && publicKeyBuffer.length !== 33 && publicKeyBuffer.length !== 65) {
      throw new Error(
        `Invalid ${paramName} length: ${publicKeyBuffer.length}. Expected 32 (x-only), 33 (compressed) or 65 (uncompressed) bytes`
      );
    }

    return publicKeyBuffer;
  }

  /**
   * Validate and convert private key to Buffer
   * @param privateKey - Private key as string or Buffer
   * @param paramName - Parameter name for error messages
   * @returns Private key as Buffer
   * @throws If private key is invalid
   */
  static validateAndConvertPrivateKey(privateKey: Buffer | string, paramName: string = "privateKey"): Buffer {
    if (privateKey === undefined || privateKey === null) {
      throw new Error(`${paramName} cannot be undefined or null`);
    }

    let privateKeyBuffer: Buffer;
    
    if (typeof privateKey === "string") {
      if (!/^[0-9a-fA-F]+$/.test(privateKey)) {
        throw new Error(`${paramName} string must contain only hexadecimal characters`);
      }
      try {
        privateKeyBuffer = Buffer.from(privateKey, "hex");
      } catch (error) {
        throw new Error(`Invalid ${paramName} hex string: ${(error as Error).message}`);
      }
    } else if (Buffer.isBuffer(privateKey)) {
      privateKeyBuffer = privateKey;
    } else {
      throw new Error(`${paramName} must be a string or Buffer`);
    }

    // Validate private key length
    if (privateKeyBuffer.length !== 32) {
      throw new Error(`Invalid ${paramName} length: ${privateKeyBuffer.length}. Expected 32 bytes`);
    }

    return privateKeyBuffer;
  }

  /**
   * Create ECPair from private key
   * @param privateKey - Private key as string or Buffer
   * @param ECPairFactory - ECPair factory function
   * @param network - Bitcoin network (optional)
   * @returns ECPair interface
   * @throws If private key is invalid
   */
  static createKeyPair(
    privateKey: Buffer | string, 
    ECPairFactory: any, 
    network?: bitcoin.Network
  ): ECPairInterface {
    try {
      const privateKeyBuffer = this.validateAndConvertPrivateKey(privateKey);
      return ECPairFactory.fromPrivateKey(privateKeyBuffer, { network });
    } catch (error) {
      throw new Error(`Failed to create key pair: ${(error as Error).message}`);
    }
  }
}
