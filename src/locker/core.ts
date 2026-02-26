/**
 * @fileoverview Core BTCLocker initialization and utilities
 */

import * as bitcoin from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import { ECPairFactory } from "ecpair";
import tinysecp from "@bitcoinerlab/secp256k1";
import type { ECCLib, InitializedECC } from "../types";
import type { NetworkType } from "../utils/network";
import { NETWORKS } from "../utils/network";
import BitcoinAPI from "../bitcoin-api";
import ScriptUtils from "../utils/scripts";

// ECC will be initialized asynchronously
let ecc: ECCLib | null = null;
let bip32: ReturnType<typeof BIP32Factory> | null = null;
let ECPair: ReturnType<typeof ECPairFactory> | null = null;

/**
 * Initialize ECC asynchronously for browser compatibility
 * @returns Promise that resolves when ECC is initialized
 * @throws If ECC initialization fails
 */
export async function initECC(): Promise<InitializedECC> {
  if (!ecc) {
    try {
      // Handle ES module default export
      ecc = (tinysecp as any).default || tinysecp;

      // Validate ECC library has required methods
      if (!ecc || typeof ecc !== "object") {
        throw new Error("ECC library is not an object");
      }

      const requiredMethods = ["isPoint", "isPrivate", "pointFromScalar"];
      for (const method of requiredMethods) {
        if (typeof (ecc as any)[method] !== "function") {
          throw new Error(`ECC library missing required method: ${method}`);
        }
      }

      // Initialize bitcoinjs-lib with the ECC library
      bitcoin.initEccLib(ecc as any);

      bip32 = BIP32Factory(ecc as any);
      ECPair = ECPairFactory(ecc as any);

      // Validate factories
      if (!bip32 || !ECPair) {
        throw new Error("Failed to create BIP32 or ECPair factories");
      }
    } catch (error) {
      throw new Error(`Failed to initialize ECC: ${(error as Error).message}`);
    }
  }
  return { ecc: ecc!, bip32: bip32!, ECPair: ECPair! };
}

/**
 * Get the initialized ECC components
 * @returns Object containing initialized ECC components
 * @throws If ECC components are not initialized
 * @example
 * const { ecc, bip32, ECPair } = getECC();
 */
export function getECC(): InitializedECC {
  if (!ecc || !bip32 || !ECPair) {
    throw new Error("ECC not initialized. Call initECC() first.");
  }
  return { ecc, bip32, ECPair };
}

/**
 * Create a tweaked signer for Taproot key-path spending.
 * For key-path spends, the private key must be tweaked with the TapTweak
 * tagged hash of the x-only public key per BIP341.
 * @param keyPair - The original ECPair signer
 * @param network - Bitcoin network
 * @returns A new ECPair with the tweaked private key for Schnorr signing
 */
export function tweakSigner(keyPair: any, network: bitcoin.Network): any {
  const { ecc: eccLib, ECPair: ECPairLib } = getECC();
  let privateKey = keyPair.privateKey;
  if (!privateKey) {
    throw new Error('Private key is required for tweaking signer');
  }
  // If the public key has an odd y-coordinate (prefix 0x03), negate the private key
  if (keyPair.publicKey[0] === 3) {
    privateKey = Buffer.from((eccLib as any).privateNegate(privateKey));
  }
  const tweakHash = bitcoin.crypto.taggedHash(
    'TapTweak',
    bitcoin.toXOnly(keyPair.publicKey),
  );
  const tweakedPrivateKey = (eccLib as any).privateAdd(privateKey, tweakHash);
  if (!tweakedPrivateKey) {
    throw new Error('Failed to produce tweaked private key');
  }
  return ECPairLib.fromPrivateKey(Buffer.from(tweakedPrivateKey), { network });
}

export class BTCLockerCore {
  public network: bitcoin.Network;
  public initialized: boolean;
  public api: BitcoinAPI;

  /**
   * Create a new BTCLockerCore instance
   * @param network - Bitcoin network ('bitcoin', 'testnet', 'regtest') or network object
   * @param api - Optional BitcoinAPI instance (will create default if not provided)
   * @example
   * // Using string network name
   * const core = new BTCLockerCore('testnet');
   * await core.init();
   *
   * // Using network object with custom API
   * const api = new BitcoinAPI('testnet', 'mempool');
   * const core = new BTCLockerCore(bitcoin.networks.testnet, api);
   * await core.init();
   */
  constructor(network: NetworkType = NETWORKS.bitcoin, api?: BitcoinAPI) {
    this.network = network.info;
    
    // Initialize API with network type
    if (api) {
      this.api = api;
    } else {
      this.api = new BitcoinAPI(network);
    }
    
    this.initialized = false;
  }

  /**
   * Initialize the BTCLocker with ECC library
   * @returns Promise that resolves when initialization is complete
   * @throws If ECC initialization fails
   * @example
   * const locker = new BTCLockerCore();
   * await locker.init();
   */
  async init(): Promise<void> {
    if (!this.initialized) {
      await initECC();
      this.initialized = true;
    }
  }

  /**
   * Ensure the instance is initialized, throw error if not
   * @returns Promise that resolves if initialized
   * @throws If not initialized
   */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Sign any transaction PSBT with one or more private keys
   * @param unsignedPsbt - Unsigned PSBT in base64 format
   * @param privateKeys - Single private key or array of private keys for multiple inputs
   * @param options - Optional signing options
   * @returns Signed transaction hex
   * @throws If signing fails
   * @example
   * // Single key for all inputs
   * const signedHex = await locker.signTransaction(unsignedPsbt, privateKey);
   * 
   * // Multiple keys for multiple inputs
   * const signedHex = await locker.signTransaction(unsignedPsbt, [escrowKey, timelockKey]);
   */
  async signTransaction(
    unsignedPsbt: string, 
    privateKeys: string | string[],
    options?: { spendAfterDeadline?: boolean }
  ): Promise<string> {
    await this.ensureInitialized();
    const { ECPair } = getECC();
    
    if (!unsignedPsbt || typeof unsignedPsbt !== 'string') {
      throw new Error("unsignedPsbt is required and must be a string");
    }

    const keys = Array.isArray(privateKeys) ? privateKeys : [privateKeys];
    if (keys.length === 0) {
      throw new Error("At least one private key is required");
    }

    try {
      const psbt = bitcoin.Psbt.fromBase64(unsignedPsbt, { network: this.network });
      
      // Create key pairs
      const keyPairs = keys.map(key => {
        if (!key || typeof key !== 'string') {
          throw new Error("All private keys must be valid hex strings");
        }
        return ECPair.fromPrivateKey(Buffer.from(key, "hex"), { network: this.network });
      });

      // Sign each input with appropriate key
      for (let i = 0; i < psbt.inputCount; i++) {
        const keyPair = keyPairs[i] || keyPairs[0]; // Use per-input key or default to first key
        const input = psbt.data.inputs[i];
        
        const isTapscriptPath = input.tapLeafScript && input.tapLeafScript.length > 0;
        
        // For P2TR key-path inputs (no tapLeafScript), fill in witnessUtxo and tapInternalKey
        if (!isTapscriptPath && input.witnessUtxo && (!input.witnessUtxo.script || 
            input.witnessUtxo.script.length === 0 || 
            input.witnessUtxo.script.every((byte: number) => byte === 0))) {
          const internalPubkey = bitcoin.toXOnly(keyPair.publicKey);
          const p2tr = bitcoin.payments.p2tr({
            internalPubkey,
            network: this.network,
          });
          
          if (!p2tr.output) {
            throw new Error(`Failed to generate P2TR output script for input ${i}`);
          }
          
          input.witnessUtxo.script = p2tr.output;
          input.tapInternalKey = internalPubkey;
        }
        
        try {
          if (isTapscriptPath) {
            // Taproot script-path: sign with the original (untweaked) key
            psbt.signInput(i, keyPair);
          } else {
            // Taproot key-path: sign with tweaked key per BIP341
            const tweakedKeyPair = tweakSigner(keyPair, this.network);
            psbt.signInput(i, tweakedKeyPair);
          }
        } catch (error) {
          throw new Error(`Failed to sign input ${i}: ${(error as Error).message}`);
        }
      }

      // Auto-finalize based on input type
      for (let i = 0; i < psbt.inputCount; i++) {
        const input = psbt.data.inputs[i];
        
        if (input.tapLeafScript && input.tapLeafScript.length > 0) {
          // Taproot script-path finalization
          const tapLeaf = input.tapLeafScript[0];
          const leafScript = Buffer.from(tapLeaf.script);
          const controlBlock = Buffer.from(tapLeaf.controlBlock);

          psbt.finalizeInput(i, (inputIndex: number, inputData: any) => {
            const sig = inputData.tapScriptSig?.[0]?.signature;
            if (!sig) {
              throw new Error(`Missing tapScriptSig for input ${inputIndex}`);
            }

            let witnessStack: Buffer[];

            if (this.hasConditionalLogic(leafScript)) {
              // Escrow-style script with IF/ELSE branches
              const useAfterDeadline = options?.spendAfterDeadline !== false; // Default true
              witnessStack = [
                sig,
                useAfterDeadline ? Buffer.of(1) : Buffer.alloc(0), // OP_TRUE or OP_FALSE selector
                leafScript,
                controlBlock,
              ];
            } else {
              // Simple tapscript (timelock, single CHECKSIG)
              witnessStack = [
                sig,
                leafScript,
                controlBlock,
              ];
            }

            return {
              finalScriptWitness: ScriptUtils.witnessStackToScriptWitness(witnessStack),
            };
          });
        } else {
          // Standard finalization (key-path P2TR or P2WPKH)
          psbt.finalizeInput(i);
        }
      }
      
      const transaction = psbt.extractTransaction();
      return transaction.toHex();
    } catch (error) {
      throw new Error(`Failed to sign transaction: ${(error as Error).message}`);
    }
  }

  /**
   * Check if a redeem script has conditional logic (IF/ELSE)
   */
  private hasConditionalLogic(redeemScript: Buffer): boolean {
    return redeemScript.includes(bitcoin.opcodes.OP_IF) || 
           redeemScript.includes(bitcoin.opcodes.OP_NOTIF);
  }

  /**
   * Submit any signed transaction to the Bitcoin network
   * @param transactionHex - Signed transaction in hex format
   * @param options - Optional submission options
   * @returns Transaction ID if submitted successfully
   * @throws If submission fails
   * @example
   * const txid = await locker.submitTransaction('01000000...');
   * 
   * // With custom API
   * const txid = await locker.submitTransaction('01000000...', { api: customAPI });
   */
  async submitTransaction(transactionHex: string, options?: { api?: any }): Promise<string> {
    if (!transactionHex || typeof transactionHex !== 'string') {
      throw new Error("transactionHex is required and must be a string");
    }

    try {
      // Parse transaction to validate and get txid
      const transaction = bitcoin.Transaction.fromHex(transactionHex);
      const txid = transaction.getId();

      // Use provided API or fall back to instance API
      const apiToUse = options?.api || this.api;
      
      // Broadcast via API if available
      if (apiToUse && typeof apiToUse.broadcastTransaction === 'function') {
        try {
          const broadcastResult = await apiToUse.broadcastTransaction(transactionHex);
          return broadcastResult.txid || txid;
        } catch (error) {
          throw new Error(`Failed to broadcast transaction: ${(error as Error).message}`);
        }
      }

      // For demo purposes, just log and return txid
      console.log(`Transaction ready for broadcast: ${txid}`);
      return txid;
    } catch (error) {
      throw new Error(`Failed to submit transaction: ${(error as Error).message}`);
    }
  }
}