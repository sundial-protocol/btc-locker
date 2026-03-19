/**
 * @fileoverview Shared transaction utilities to eliminate code duplication
 */

import * as bitcoin from "bitcoinjs-lib";
import { ECPairInterface } from "ecpair";
import { ECPairFactoryType } from "../types.js";

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
  private static toBuffer(key: Buffer | string, paramName: string): Buffer {
    if (key == null)
      throw new Error(`${paramName} cannot be undefined or null`);
    if (Buffer.isBuffer(key)) return key;
    if (typeof key === "string") {
      if (!/^[0-9a-fA-F]+$/.test(key))
        throw new Error(
          `${paramName} string must contain only hexadecimal characters`,
        );
      try {
        return Buffer.from(key, "hex");
      } catch (error) {
        throw new Error(
          `Invalid ${paramName} hex string: ${(error as Error).message}`,
        );
      }
    }
    throw new Error(`${paramName} must be a string or Buffer`);
  }

  static validateAndConvertPublicKey(
    publicKey: Buffer | string,
    paramName: string = "publicKey",
  ): Buffer {
    const buf = this.toBuffer(publicKey, paramName);
    if (buf.length !== 33 && buf.length !== 65) {
      throw new Error(
        `Invalid ${paramName} length: ${buf.length}. Expected 33 (compressed) or 65 (uncompressed) bytes`,
      );
    }
    return buf;
  }

  static validateAndConvertPrivateKey(
    privateKey: Buffer | string,
    paramName: string = "privateKey",
  ): Buffer {
    const buf = this.toBuffer(privateKey, paramName);
    if (buf.length !== 32) {
      throw new Error(
        `Invalid ${paramName} length: ${buf.length}. Expected 32 bytes`,
      );
    }
    return buf;
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
    ECPairFactory: ECPairFactoryType,
    network?: bitcoin.Network,
  ): ECPairInterface {
    try {
      const privateKeyBuffer = this.validateAndConvertPrivateKey(privateKey);
      return ECPairFactory.fromPrivateKey(privateKeyBuffer, { network });
    } catch (error) {
      throw new Error(`Failed to create key pair: ${(error as Error).message}`);
    }
  }

  // supports pkhs in string, buffer, or Uint8Array format
  static toXOnly(publicKey: string | Uint8Array): string | Uint8Array {
    if (typeof publicKey === "string" && publicKey.length === 66) {
      return publicKey.slice(2, 66);
    }
    if (publicKey instanceof Uint8Array && publicKey.length !== 33) {
      return publicKey.slice(1, 33);
    }
    return publicKey;
  }
}
