/**
 * @fileoverview Transaction creation and management functionality
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core";
import type { UTXO, TransactionResult } from "../types";

interface TransactionOutput {
  address: string;
  value: number;
}

interface TransactionInput {
  txid: string;
  vout: number;
  value: number;
  hex: string;
}

interface SpendingTransactionParams {
  inputs: UTXO[];
  outputs: TransactionOutput[];
  redeemScript: string;
  privateKeys: string[];
  locktime?: number;
}

interface FundingTransactionParams {
  inputs: UTXO[];
  outputs: TransactionOutput[];
  privateKey: string;
}

/**
 * Transaction management class for creating funding and spending transactions
 * @class TransactionManager
 */
export class TransactionManager extends BTCLockerCore {
  /**
   * Create spending transaction for timelock scripts
   * @async
   * @param params - Transaction parameters
   * @returns Transaction details object
   * @throws If timelock hasn't expired or parameters are invalid
   * @example
   * const txManager = new TransactionManager();
   * const tx = await txManager.createSpendingTransaction({
   *   inputs: [{ txid: '...', vout: 0, value: 100000 }],
   *   outputs: [{ address: '...', value: 95000 }],
   *   redeemScript: '...',
   *   privateKeys: ['...']
   * });
   */
  async createSpendingTransaction(params: SpendingTransactionParams): Promise<TransactionResult> {
    await this.ensureInitialized();
    const { ECPair } = getECC();
    const { inputs, outputs, redeemScript, privateKeys } = params;

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

    // Sign inputs
    inputs.forEach((utxo, inputIndex) => {
      // For simple timelock scripts, use the first private key
      // For multisig or HODL scripts, this would need to be adjusted
      const privateKey =
        typeof privateKeys[0] === "string"
          ? Buffer.from(privateKeys[0], "hex")
          : Buffer.from(privateKeys[0]);

      const keyPair = ECPair.fromPrivateKey(privateKey, {
        network: this.network,
      });
      const redeemScriptBuf = Buffer.from(redeemScript, "hex");
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
    });

    // Convert to TransactionResult
    const txHex = tx.toHex();
    return {
      hex: txHex,
      txid: tx.getId(),
      size: tx.virtualSize(),
      fee: 0 // TODO: Calculate actual fee
    };
  }

  /**
   * Create a funding transaction to send Bitcoin to a timelock script
   * @async
   * @param params - Funding transaction parameters
   * @returns Signed transaction object
   * @throws If insufficient funds or invalid parameters
   * @example
   * const txManager = new TransactionManager();
   * const tx = await txManager.createFundingTransaction({
   *   inputs: [{ txid: '...', vout: 0, value: 200000 }],
   *   outputs: [{ address: '3...', value: 100000 }],
   *   privateKey: '...'
   * });
   */
  async createFundingTransaction(params: FundingTransactionParams): Promise<TransactionResult> {
    await this.ensureInitialized();
    const { ECPair } = getECC();
    const { inputs, outputs, privateKey } = params;

    const psbt = new bitcoin.Psbt({ network: this.network });
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, "hex"), {
      network: this.network,
    });

    // Add inputs
    for (const input of inputs) {
      const inputData = {
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: bitcoin.payments.p2wpkh({
            pubkey: keyPair.publicKey,
            network: this.network,
          }).output!,
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

    // Sign all inputs
    for (let i = 0; i < inputs.length; i++) {
      try {
        psbt.signInput(i, keyPair);
      } catch (error) {
        console.warn(`Could not sign input ${i}:`, (error as Error).message);
        throw error; // Re-throw to help with debugging
      }
    }

    // Finalize and extract transaction
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();
    
    // Convert to TransactionResult
    const txHex = tx.toHex();
    return {
      hex: txHex,
      txid: tx.getId(),
      size: tx.virtualSize(),
      fee: 0 // TODO: Calculate actual fee
    };
  }
}