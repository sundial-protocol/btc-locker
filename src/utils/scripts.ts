import * as bitcoin from "bitcoinjs-lib";

/**
 * Default Sundial namespace x-only public key (32 bytes).
 * Used as the internalPubkey for all P2TR script addresses in the protocol.
 * This is a shared, publicly known key that anchors all Taproot scripts to
 * the Sundial namespace, ensuring key-path spending is disabled (no one
 * knows the private key) while enabling script-path spending via tapscript.
 */
export const SUNDIAL_NAMESPACE_XONLY = Buffer.from(
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "hex"
);

/**
 * Default Taproot leaf version for tapscript
 */
export const TAPROOT_LEAF_VERSION = 0xc0;

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
      return publicKey.length === 32 || publicKey.length === 33 || publicKey.length === 65;
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
   * Validate Bitcoin address (supports P2PKH, P2SH, P2WPKH, P2WSH, and P2TR/Taproot)
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
   * Create P2TR address from a tapscript leaf
   * @param redeemScript - The tapscript leaf script buffer
   * @param network - Bitcoin network
   * @param internalPubkey - x-only internal pubkey (defaults to SUNDIAL_NAMESPACE_XONLY)
   * @returns P2TR address string
   * @throws If script is invalid or address creation fails
   */
  static createScriptAddress(
    redeemScript: Buffer,
    network: bitcoin.Network,
    internalPubkey: Buffer = SUNDIAL_NAMESPACE_XONLY,
  ): string {
    try {
      if (!redeemScript || redeemScript.length === 0) {
        throw new Error("Invalid redeem script: empty or undefined");
      }
      
      if (!network) {
        throw new Error("Invalid network: network parameter is undefined");
      }

      const tapLeaf = { output: redeemScript };
      const payment = bitcoin.payments.p2tr({
        internalPubkey,
        scriptTree: tapLeaf,
        network,
      });

      if (!payment || !payment.address) {
        throw new Error("Failed to generate P2TR address from script");
      }

      return payment.address;
    } catch (error) {
      throw new Error(`Failed to create script address: ${(error as Error).message}`);
    }
  }

  /**
   * Derive the revealed script and control block for script-path spending of a tapscript leaf.
   * @param redeemScript - The tapscript leaf script buffer
   * @param network - Bitcoin network
   * @param internalPubkey - x-only internal pubkey (defaults to SUNDIAL_NAMESPACE_XONLY)
   * @returns Object containing revealedScript, controlBlock, outputScript, and address
   */
  static deriveTaprootSpendInfo(
    redeemScript: Buffer,
    network: bitcoin.Network,
    internalPubkey: Buffer = SUNDIAL_NAMESPACE_XONLY,
  ): { revealedScript: Buffer; controlBlock: Buffer; outputScript: Buffer; address: string } {
    const tapLeaf = { output: redeemScript };
    const spend = bitcoin.payments.p2tr({
      internalPubkey,
      scriptTree: tapLeaf,
      redeem: tapLeaf,
      network,
    });

    if (!spend.witness || spend.witness.length < 2) {
      throw new Error("Failed to derive script-path witness/controlBlock");
    }
    if (!spend.output || !spend.address) {
      throw new Error("Failed to derive P2TR output/address");
    }

    const revealedScript = spend.witness[spend.witness.length - 2];
    const controlBlock = spend.witness[spend.witness.length - 1];

    return {
      revealedScript: Buffer.from(revealedScript),
      controlBlock: Buffer.from(controlBlock),
      outputScript: Buffer.from(spend.output),
      address: spend.address,
    };
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
   * Encode a witness stack into the serialised witnessScript format
   * expected by finalScriptWitness in a PSBT.
   * @param witnessStack - Array of witness stack items (signature, script, control block, etc.)
   * @returns Serialised witness as Buffer
   */
  static witnessStackToScriptWitness(witnessStack: Buffer[]): Buffer {
    const parts: Buffer[] = [];

    // varint: number of stack items
    parts.push(ScriptUtils.encodeVarInt(witnessStack.length));

    for (const item of witnessStack) {
      // varint: length of this item, then the item itself
      parts.push(ScriptUtils.encodeVarInt(item.length));
      parts.push(item);
    }

    return Buffer.concat(parts);
  }

  /**
   * Encode an integer as a Bitcoin-style variable-length integer
   */
  private static encodeVarInt(n: number): Buffer {
    if (n < 0xfd) {
      const buf = Buffer.alloc(1);
      buf.writeUInt8(n, 0);
      return buf;
    } else if (n <= 0xffff) {
      const buf = Buffer.alloc(3);
      buf.writeUInt8(0xfd, 0);
      buf.writeUInt16LE(n, 1);
      return buf;
    } else if (n <= 0xffffffff) {
      const buf = Buffer.alloc(5);
      buf.writeUInt8(0xfe, 0);
      buf.writeUInt32LE(n, 1);
      return buf;
    } else {
      throw new Error(`Value too large for varint: ${n}`);
    }
  }
}