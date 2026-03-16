/**
 * @fileoverview Core BTCLocker initialization and utilities
 */

import * as bitcoin from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import { ECPairFactory } from "ecpair";
import tinysecp from "@bitcoinerlab/secp256k1";
import type { ECCLib, InitializedECC } from "../types.js";
import { NetworkType, NETWORKS } from "../utils/network.js";
import BitcoinAPI from "../bitcoin-api.js";

/** Shared context for transaction-building functions */
export interface LockerContext {
  network: bitcoin.Network;
  api: BitcoinAPI;
}

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
      // TODO: These interfaces do not fit together cleanly. There is probably a better way to do this.
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

  if (!ecc || !bip32 || !ECPair) {
    throw new Error("Last chance validation - ECC not initialized");
  }
  return { ecc, bip32, ECPair };
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
    options?: { spendAfterDeadline?: boolean },
  ): Promise<string> {
    await this.ensureInitialized();
    const { ECPair } = getECC();

    if (!unsignedPsbt || typeof unsignedPsbt !== "string") {
      throw new Error("unsignedPsbt is required and must be a string");
    }

    const keys = Array.isArray(privateKeys) ? privateKeys : [privateKeys];
    if (keys.length === 0) {
      throw new Error("At least one private key is required");
    }

    try {
      const psbt = bitcoin.Psbt.fromBase64(unsignedPsbt, {
        network: this.network,
      });

      // Create key pairs
      const keyPairs = keys.map((key) => {
        if (!key || typeof key !== "string") {
          throw new Error("All private keys must be valid hex strings");
        }
        return ECPair.fromPrivateKey(Buffer.from(key, "hex"), {
          network: this.network,
        });
      });

      // Sign each input with appropriate key
      for (let i = 0; i < psbt.inputCount; i++) {
        const keyPair = keyPairs[i] || keyPairs[0]; // Use per-input key or default to first key
        const input = psbt.data.inputs[i];

        // Update witnessUtxo if needed for P2WPKH inputs
        if (
          input.witnessUtxo &&
          (!input.witnessUtxo.script ||
            input.witnessUtxo.script.length === 0 ||
            input.witnessUtxo.script.every((byte) => byte === 0))
        ) {
          input.witnessUtxo.script =
            bitcoin.payments.p2wpkh({
              pubkey: keyPair.publicKey,
              network: this.network,
            }).output ??
            (() => {
              throw new Error("Failed to generate P2WPKH output script");
            })();
        }

        try {
          psbt.signInput(i, keyPair);
        } catch (error) {
          throw new Error(
            `Failed to sign input ${i}: ${(error as Error).message}`,
          );
        }
      }

      const finalizedPsbt = this.finalizeTransaction(
        psbt,
        options?.spendAfterDeadline,
      );

      const transaction = finalizedPsbt.extractTransaction();
      return transaction.toHex();
    } catch (error) {
      throw new Error(
        `Failed to sign transaction: ${(error as Error).message}`,
      );
    }
  }

  finalizeTransaction(
    psbt: bitcoin.Psbt,
    spendAfterDeadline = true,
  ): bitcoin.Psbt {
    // Auto-finalize based on script structure
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];

      if (input.redeemScript) {
        // Custom finalization for scripts
        const redeemScript = Buffer.from(input.redeemScript);

        // Auto-detect script type and apply appropriate finalization
        if (this.hasConditionalLogic(redeemScript)) {
          // Escrow-style script with conditional logic
          psbt.finalizeInput(i, (inputIndex: number, inputData: any) => {
            const signature = inputData.partialSig?.[0]?.signature;
            if (!signature) {
              throw new Error(`Missing signature for input ${inputIndex}`);
            }
            // check whether to use after-deadline spending path for escrow scripts
            const scriptSig = bitcoin.script.compile([
              signature,
              spendAfterDeadline
                ? bitcoin.opcodes.OP_TRUE
                : bitcoin.opcodes.OP_FALSE,
              redeemScript,
            ]);

            return {
              finalScriptSig: scriptSig,
              finalScriptWitness: undefined,
            };
          });
        } else {
          // Simple script or timelock script
          psbt.finalizeInput(i, (inputIndex: number, inputData: any) => {
            const signature = inputData.partialSig?.[0]?.signature;
            if (!signature) {
              throw new Error(`Missing signature for input ${inputIndex}`);
            }

            const scriptSig = bitcoin.script.compile([signature, redeemScript]);

            return {
              finalScriptSig: scriptSig,
              finalScriptWitness: undefined,
            };
          });
        }
      } else {
        // Standard finalization
        psbt.finalizeInput(i);
      }
    }

    return psbt;
  }

  /**
   * Check if a redeem script has conditional logic (IF/ELSE)
   */
  private hasConditionalLogic(redeemScript: Buffer): boolean {
    return (
      redeemScript.includes(bitcoin.opcodes.OP_IF) ||
      redeemScript.includes(bitcoin.opcodes.OP_NOTIF)
    );
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
  async submitTransaction(
    transactionHex: string,
    options?: { api?: BitcoinAPI },
  ): Promise<string> {
    if (!transactionHex || typeof transactionHex !== "string") {
      throw new Error("transactionHex is required and must be a string");
    }

    try {
      // Parse transaction to validate and get txid
      const transaction = bitcoin.Transaction.fromHex(transactionHex);
      const txid = transaction.getId();

      // Use provided API or fall back to instance API
      const apiToUse = options?.api || this.api;

      // Broadcast via API if available
      if (apiToUse && typeof apiToUse.broadcastTransaction === "function") {
        try {
          const broadcastResult =
            await apiToUse.broadcastTransaction(transactionHex);
          return broadcastResult.txid || txid;
        } catch (error) {
          throw new Error(
            `Failed to broadcast transaction: ${(error as Error).message}`,
          );
        }
      }
      return txid;
    } catch (error) {
      throw new Error(
        `Failed to submit transaction: ${(error as Error).message}`,
      );
    }
  }
}
