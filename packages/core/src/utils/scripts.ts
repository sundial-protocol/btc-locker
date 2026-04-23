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
  static isValidAddress(
    address: string,
    network: bitcoin.Network = bitcoin.networks.bitcoin,
  ): boolean {
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
   * Create P2WSH address from redeem script
   * @param redeemScript - The redeem script buffer
   * @param network - Bitcoin network
   * @returns P2WSH address string
   * @throws If script is invalid or address creation fails
   */
  static createScriptAddress(
    redeemScript: Buffer,
    network: bitcoin.Network,
  ): string {
    try {
      if (!redeemScript || redeemScript.length === 0) {
        throw new Error("Invalid redeem script: empty or undefined");
      }

      if (!network) {
        throw new Error("Invalid network: network parameter is undefined");
      }

      const payment = bitcoin.payments.p2wsh({
        redeem: { output: redeemScript, network },
        network,
      });

      if (!payment || !payment.address) {
        throw new Error(
          "Failed to generate address from script - payment object or address is undefined",
        );
      }

      return payment.address;
    } catch (error) {
      throw new Error(
        `Failed to create script address: ${(error as Error).message}`,
      );
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

  /**
   * Extract locktime from a CLTV redeem script (timelock or escrow)
   * @param redeemScriptHex - Redeem script in hex format
   * @returns Locktime as number, or null if not a CLTV script
   */
  static extractLocktimeFromScript(redeemScriptHex: string): number | null {
    try {
      const ops = bitcoin.script.decompile(Buffer.from(redeemScriptHex, "hex"));
      if (!ops) return null;
      const cltvIndex = ops.findIndex(
        (op) => op === bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      );
      if (cltvIndex < 1) return null;
      const locktimeOp = ops[cltvIndex - 1];
      if (typeof locktimeOp === "number") return locktimeOp;
      if (Buffer.isBuffer(locktimeOp) || locktimeOp instanceof Uint8Array) {
        let value = 0;
        for (let i = 0; i < locktimeOp.length; i++)
          value += locktimeOp[i] << (8 * i);
        return value;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract the relative sequence value from a CSV redeem script.
   * Returns the raw block/time count encoded in the script, or null if not a CSV script.
   * The caller is responsible for BIP-68 nSequence encoding.
   * @param redeemScriptHex - Redeem script in hex format
   * @returns Sequence as number, or null if not a CSV script
   */
  static extractSequenceFromScript(redeemScriptHex: string): number | null {
    try {
      const ops = bitcoin.script.decompile(Buffer.from(redeemScriptHex, "hex"));
      if (!ops) return null;
      const csvIndex = ops.findIndex(
        (op) => op === bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
      );
      if (csvIndex < 1) return null;
      const sequenceOp = ops[csvIndex - 1];
      if (typeof sequenceOp === "number") {
        // OP_1 (0x51) through OP_16 (0x60) are minimal encodings for integers 1–16.
        // script.decompile() returns them as their opcode constants, not as the
        // integer they push — so we must map them back to their actual values.
        if (
          sequenceOp >= bitcoin.opcodes.OP_1 &&
          sequenceOp <= bitcoin.opcodes.OP_16
        ) {
          return sequenceOp - bitcoin.opcodes.OP_1 + 1;
        }
        return sequenceOp;
      }
      if (Buffer.isBuffer(sequenceOp) || sequenceOp instanceof Uint8Array) {
        let value = 0;
        for (let i = 0; i < sequenceOp.length; i++)
          value += sequenceOp[i] << (8 * i);
        return value;
      }
      return null;
    } catch {
      return null;
    }
  }
}
