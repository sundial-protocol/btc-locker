import * as bitcoin from "bitcoinjs-lib";

/**
 * Script validation utilities
 */
export default class ScriptUtils {
  /**
   * Validate public key format
   * @param publicKey - Public key to validate
   * @returns True if valid
   */
  static isValidPublicKey(publicKey: string | Buffer): boolean {
    try {
      if (typeof publicKey === "string") {
        publicKey = Buffer.from(publicKey, "hex");
      }
      return publicKey.length === 33 || publicKey.length === 65;
    } catch {
      return false;
    }
  }

  /**
   * Validate private key format
   * @param privateKey - Private key to validate
   * @returns True if valid
   */
  static isValidPrivateKey(privateKey: string | Buffer): boolean {
    try {
      if (typeof privateKey === "string") {
        privateKey = Buffer.from(privateKey, "hex");
      }
      return privateKey.length === 32;
    } catch {
      return false;
    }
  }

  /**
   * Validate Bitcoin address
   * @param address - Bitcoin address to validate
   * @param network - Bitcoin network (optional)
   * @returns True if valid
   */
  static isValidAddress(address: string, network: bitcoin.Network = bitcoin.networks.bitcoin): boolean {
    try {
      bitcoin.address.toOutputScript(address, network);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse script hex to human-readable format
   * @param scriptHex - Script in hex format
   * @returns Human-readable script
   */
  static parseScript(scriptHex: string): string {
    const script = Buffer.from(scriptHex, "hex");
    const decompiled = bitcoin.script.decompile(script);

    if (!decompiled) {
      throw new Error("Failed to decompile script");
    }

    return decompiled
      .map((element) => {
        if (Buffer.isBuffer(element)) {
          return element.toString("hex");
        } else {
          return bitcoin.script.toASM([element]);
        }
      })
      .join(" ");
  }

    /**
   * Create P2SH address from redeem script
   * @param redeemScript - The redeem script buffer
   * @param network - Bitcoin network
   * @returns P2SH address string
   * @throws If script is invalid or address creation fails
   */
  static createScriptAddress(redeemScript: Buffer, network: bitcoin.Network): string {
    try {
      if (!redeemScript || redeemScript.length === 0) {
        throw new Error("Invalid redeem script: empty or undefined");
      }
      
      if (!network) {
        throw new Error("Invalid network: network parameter is undefined");
      }

      const scriptHash = bitcoin.crypto.hash160(redeemScript);
      const payment = bitcoin.payments.p2sh({
        hash: scriptHash,
        network: network,
      });

      if (!payment || !payment.address) {
        throw new Error("Failed to generate address from script - payment object or address is undefined");
      }

      return payment.address;
    } catch (error) {
      throw new Error(`Failed to create script address: ${(error as Error).message}`);
    }
  }

  /**
   * Calculate script hash from redeem script
   * @param redeemScript - The redeem script buffer
   * @returns Script hash as hex string
   */
  static calculateScriptHash(redeemScript: Buffer): string {
    const hash = bitcoin.crypto.hash160(redeemScript);
    return Buffer.from(hash).toString("hex");
  }
}