/**
 * @fileoverview Transaction creation and management functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core";
import type { UTXO, TransactionResult } from "../types";

/**
 * Transaction output specification
 * @interface TransactionOutput
 * @description Specifies destination address and value for transaction outputs
 */
export interface TransactionOutput {
  /** Destination Bitcoin address */
  address: string;
  /** Output value in satoshis */
  value: number;
}

interface TransactionInput {
  txid: string;
  vout: number;
  value: number;
  hex: string;
}

/**
 * Parameters for creating spending transactions
 * @interface SpendingTransactionParams
 * @description Configuration for spending from time-locked Bitcoin scripts
 */
export interface SpendingTransactionParams {
  /** Array of unspent transaction outputs to spend */
  inputs: UTXO[];
  /** Output destinations and amounts */
  outputs: TransactionOutput[];
  /** Redeem script in hexadecimal format */
  redeemScript: string;
  /** Optional locktime for the transaction */
  locktime?: number;
}

/**
 * Parameters for creating funding transactions
 * @interface FundingTransactionParams
 * @description Configuration for creating transactions that fund Bitcoin scripts
 */
export interface FundingTransactionParams {
  /** Array of unspent transaction outputs to use as funding */
  inputs: UTXO[];
  /** Output destinations and amounts */
  outputs: TransactionOutput[];
}

/**
 * Parameters for signing transactions
 * @interface TransactionSigningParams
 * @description Configuration for signing unsigned transactions
 */
export interface TransactionSigningParams {
  /** Unsigned transaction hex or PSBT */
  unsignedTransaction: string;
  /** Private keys for signing the transaction */
  privateKeys: string[];
  /** Optional redeem script for spending transactions */
  redeemScript?: string;
  /** Transaction type to determine signing method */
  transactionType: 'funding' | 'spending';
}

/**
 * Parameters for signing spending transactions
 * @interface SpendingTransactionSigningParams
 * @description Configuration for signing unsigned spending transactions
 */
export interface SpendingTransactionSigningParams {
  /** Unsigned transaction hex or PSBT */
  unsignedTransaction: string;
  /** Private keys for signing the transaction */
  privateKeys: string[];
  /** Redeem script for spending transactions */
  redeemScript: string;
}

/**
 * Parameters for signing funding transactions
 * @interface FundingTransactionSigningParams
 * @description Configuration for signing unsigned funding transactions
 */
export interface FundingTransactionSigningParams {
  /** Unsigned transaction hex or PSBT */
  unsignedTransaction: string;
  /** Private keys for signing the transaction */
  privateKeys: string[];
}

/**
 * Parameters for submitting signed transactions
 * @interface TransactionSubmissionParams
 * @description Configuration for submitting transactions to the network
 */
export interface TransactionSubmissionParams {
  /** Signed transaction hex */
  signedTransaction: string;
  /** Optional API instance for broadcasting */
  api?: any;
}

/**
 * Transaction management class for creating funding and spending transactions
 * @class TransactionManager
 */
export class TransactionManager extends BTCLockerCore {
  /**
   * Create unsigned spending transaction for timelock scripts
   * @async
   * @param params - Transaction parameters
   * @returns Unsigned transaction hex
   * @throws If timelock hasn't expired or parameters are invalid
   * @example
   * const txManager = new TransactionManager();
   * const unsignedTx = await txManager.createSpendingTransaction({
   *   inputs: [{ txid: '...', vout: 0, value: 100000 }],
   *   outputs: [{ address: '...', value: 95000 }],
   *   redeemScript: '...'
   * });
   */
  async createSpendingTransaction(params: SpendingTransactionParams): Promise<string> {
    await this.ensureInitialized();
    const { inputs, outputs, redeemScript } = params;

    // First, check if this is a timelock script and if it has expired
    const redeemScriptBuffer = Buffer.from(redeemScript, "hex");
    let locktime: number | null = null;

    try {
      const ops = bitcoin.script.decompile(redeemScriptBuffer);
      if (
        ops &&
        ops.length > 1 &&
        ops[1] === bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY
      ) {
        // Extract locktime from the first operation (could be number or Buffer)
        if (typeof ops[0] === "number") {
          locktime = ops[0];
        } else if (Buffer.isBuffer(ops[0])) {
          // Convert buffer to number (little endian)
          let locktimeValue = 0;
          for (let i = 0; i < ops[0].length; i++) {
            locktimeValue += ops[0][i] << (8 * i);
          }
          locktime = locktimeValue;
        }

        if (locktime) {
          const currentTime = Math.floor(Date.now() / 1000);

          if (currentTime < locktime) {
            const timeRemaining = locktime - currentTime;
            const expiryDate = new Date(locktime * 1000).toISOString();
            throw new Error(
              `Timelock has not expired yet. ` +
                `Current time: ${currentTime}, Locktime: ${locktime}. ` +
                `Time remaining: ${timeRemaining} seconds. ` +
                `Expires at: ${expiryDate}`
            );
          }
        }
      }
    } catch (error) {
      if ((error as Error).message.includes("Timelock has not expired")) {
        throw error; // Re-throw timelock errors
      }
      console.warn("Could not parse locktime from script:", (error as Error).message);
    }

    // Create transaction manually for better P2SH support
    const tx = new bitcoin.Transaction();
    tx.version = 2;

    if (locktime) {
      tx.locktime = locktime;
    }

    // Add inputs with appropriate sequence numbers
    inputs.forEach((utxo) => {
      // Convert txid string to Buffer and reverse for correct byte order
      const txHash = Buffer.from(utxo.txid, "hex").reverse();
      // If this is a timelock script (locktime exists and has passed validation above),
      // use sequence < 0xffffffff to enable locktime checking
      tx.addInput(txHash, utxo.vout, locktime ? 0xfffffffe : 0xffffffff);
    });

    // Add outputs
    outputs.forEach((output) => {
      tx.addOutput(
        bitcoin.address.toOutputScript(output.address, this.network),
        BigInt(output.value)
      );
    });

    // Return unsigned transaction hex
    return tx.toHex();
  }

  /**
   * Create an unsigned funding transaction to send Bitcoin to a timelock script
   * @async
   * @param params - Funding transaction parameters
   * @returns Unsigned PSBT base64 string
   * @throws If invalid parameters
   * @example
   * const txManager = new TransactionManager();
   * const unsignedPsbt = await txManager.createFundingTransaction({
   *   inputs: [{ txid: '...', vout: 0, value: 200000 }],
   *   outputs: [{ address: '3...', value: 100000 }]
   * });
   */
  async createFundingTransaction(params: FundingTransactionParams): Promise<string> {
    await this.ensureInitialized();
    const { inputs, outputs } = params;

    const psbt = new bitcoin.Psbt({ network: this.network });

    // Add inputs (without signing information for now)
    for (const input of inputs) {
      // For funding transactions, we'll need the full transaction data
      // This is a simplified version - in practice you'd need to fetch the full UTXO data
      const inputData = {
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: Buffer.alloc(0), // This would need to be filled with actual script
          value: BigInt(input.value),
        },
      };

      psbt.addInput(inputData);
    }

    // Add outputs
    for (const output of outputs) {
      psbt.addOutput({
        address: output.address,
        value: BigInt(output.value),
      });
    }

    // Return unsigned PSBT as base64
    return psbt.toBase64();
  }

  /**
   * Sign a transaction using legacy parameter interface
   * @deprecated Use the generic signTransaction method instead
   * @async
   * @param params - Transaction signing parameters
   * @returns Signed transaction hex
   * @throws If signing fails
   * @example
   * const txManager = new TransactionManager();
   * const signedTx = await txManager.signTransactionLegacy({
   *   unsignedTransaction: 'unsigned_tx_hex_or_psbt_base64',
   *   privateKeys: ['private_key_hex'],
   *   transactionType: 'funding'
   * });
   */
  async signTransactionLegacy(params: TransactionSigningParams): Promise<string> {
    await this.ensureInitialized();
    const { ECPair } = getECC();
    const { unsignedTransaction, privateKeys, redeemScript, transactionType } = params;

    if (transactionType === 'funding') {
      // Handle PSBT signing for funding transactions
      const psbt = bitcoin.Psbt.fromBase64(unsignedTransaction, { network: this.network });
      
      // Sign with the provided private keys
      for (let i = 0; i < psbt.inputCount; i++) {
        const privateKey = privateKeys[i] || privateKeys[0]; // Use first key if not enough keys provided
        const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, "hex"), {
          network: this.network,
        });
        
        // Add witness UTXO script if missing
        const input = psbt.data.inputs[i];
        if (input.witnessUtxo && !input.witnessUtxo.script.length) {
          input.witnessUtxo.script = bitcoin.payments.p2wpkh({
            pubkey: keyPair.publicKey,
            network: this.network,
          }).output!;
        }
        
        try {
          psbt.signInput(i, keyPair);
        } catch (error) {
          console.warn(`Could not sign input ${i}:`, (error as Error).message);
          throw error;
        }
      }
      
      psbt.finalizeAllInputs();
      const tx = psbt.extractTransaction();
      return tx.toHex();
      
    } else if (transactionType === 'spending') {
      // Handle raw transaction signing for spending transactions
      const tx = bitcoin.Transaction.fromHex(unsignedTransaction);
      
      if (!redeemScript) {
        throw new Error("Redeem script is required for spending transactions");
      }
      
      const redeemScriptBuf = Buffer.from(redeemScript, "hex");
      
      // Sign each input
      for (let inputIndex = 0; inputIndex < tx.ins.length; inputIndex++) {
        const privateKey = privateKeys[inputIndex] || privateKeys[0];
        const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, "hex"), {
          network: this.network,
        });
        
        const hashType = bitcoin.Transaction.SIGHASH_ALL;
        
        // Create signature hash
        const signatureHash = tx.hashForSignature(
          inputIndex,
          redeemScriptBuf,
          hashType
        );
        
        // Sign with canonical DER encoding
        const signature = keyPair.sign(Buffer.from(signatureHash));
        const signatureWithHashType = bitcoin.script.signature.encode(
          signature,
          hashType
        );
        
        // Create scriptSig
        const scriptSig = bitcoin.script.compile([
          signatureWithHashType,
          redeemScriptBuf,
        ]);
        
        // Set input script
        tx.setInputScript(inputIndex, scriptSig);
      }
      
      return tx.toHex();
    }
    
    throw new Error(`Unsupported transaction type: ${transactionType}`);
  }

  /**
   * Submit a signed transaction to the Bitcoin network using legacy parameter interface
   * @deprecated Use the generic submitTransaction method instead
   * @async
   * @param params - Transaction submission parameters
   * @returns Transaction result with broadcast information
   * @throws If submission fails
   * @example
   * const txManager = new TransactionManager();
   * const result = await txManager.submitTransactionLegacy({
   *   signedTransaction: 'signed_tx_hex',
   *   api: bitcoinApiInstance
   * });
   */
  async submitTransactionLegacy(params: TransactionSubmissionParams): Promise<TransactionResult> {
    const { signedTransaction, api } = params;
    
    const tx = bitcoin.Transaction.fromHex(signedTransaction);
    
    let txid = tx.getId();
    
    // If API is provided, broadcast the transaction
    if (api && typeof api.broadcastTransaction === 'function') {
      try {
        const broadcastResult = await api.broadcastTransaction(signedTransaction);
        txid = broadcastResult.txid || txid;
      } catch (error) {
        throw new Error(`Failed to broadcast transaction: ${(error as Error).message}`);
      }
    }
    
    return {
      hex: signedTransaction,
      txid: txid,
      size: tx.virtualSize(),
      fee: 0 // TODO: Calculate actual fee if inputs/outputs are known
    };
  }

  /**
   * Convenience method to sign and submit a transaction in one call
   * @async
   * @param signingParams - Transaction signing parameters
   * @param submissionParams - Transaction submission parameters (optional api)
   * @returns Transaction result with broadcast information
   * @example
   * const txManager = new TransactionManager();
   * const result = await txManager.signAndSubmitTransaction(
   *   {
   *     unsignedTransaction: 'unsigned_tx_hex',
   *     privateKeys: ['private_key_hex'],
   *     transactionType: 'funding'
   *   },
   *   { api: bitcoinApiInstance }
   * );
   */
  async signAndSubmitTransaction(
    signingParams: TransactionSigningParams,
    submissionParams?: { api?: any }
  ): Promise<TransactionResult> {
    const signedTx = await this.signTransactionLegacy(signingParams);
    
    return this.submitTransactionLegacy({
      signedTransaction: signedTx,
      api: submissionParams?.api
    });
  }
}