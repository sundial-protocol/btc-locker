/**
 * @fileoverview Time-based escrow script functionality using Taproot
 * @description Create Taproot scripts where one user can withdraw before a deadline and another after
 */

import * as bitcoin from "bitcoinjs-lib";
import { BTCLockerCore, getECC } from "./core";
import { KeyUtils, ValidationUtils, ScriptUtils } from "../utils";
import { SUNDIAL_NAMESPACE_XONLY, TAPROOT_LEAF_VERSION } from "../utils/scripts";
import type { ScriptInfo } from "../types";

/**
 * Escrow transaction creation parameters
 * @interface EscrowSpendingParams
 * @description Parameters for creating an unsigned escrow spending transaction
 */
export interface EscrowSpendingParams {
  /** Script data returned from createEscrowScript (must include controlBlock) */
  scriptData: ScriptInfo;
  /** Transaction ID of the UTXO to spend */
  utxoTxId: string;
  /** Output index of the UTXO to spend */
  utxoIndex: number;
  /** Amount in satoshis to spend */
  amount: number;
  /** Address to send funds to */
  outputAddress: string;
  /** Whether to spend after deadline (true) or before (false) */
  spendAfterDeadline: boolean;
  /** Current time for validation (defaults to Date.now()) */
  currentTime?: number;
}

/**
 * Escrow transaction signing parameters
 * @interface EscrowSpendingSigningParams
 * @description Parameters for signing an unsigned escrow transaction
 */
export interface EscrowSpendingSigningParams {
  /** Unsigned transaction as base64 PSBT */
  unsignedTransaction: string;
  /** Private key corresponding to the appropriate public key */
  privateKey: Buffer | string;
  /** Whether this is spending after deadline (affects validation) */
  spendAfterDeadline: boolean;
}

/**
 * Escrow spending transaction result
 * @interface EscrowSpendingTransaction
 * @description Result of spending from an escrow script
 */
export interface EscrowSpendingTransaction {
  /** Transaction in hexadecimal format */
  txHex: string;
  /** Transaction ID (hash) */
  txId: string;
}

/**
 * Time-based escrow script management class
 * @class EscrowManager
 * @description Creates Bitcoin scripts that implement time-based escrow functionality
 * where one party can withdraw before a deadline and another party can withdraw after
 */
export class EscrowManager extends BTCLockerCore {
  /**
   * Create a time-based escrow script
   * @async
   * @param deadline - Unix timestamp deadline
   * @param beforePublicKey - Public key of user who can withdraw before deadline
   * @param afterPublicKey - Public key of user who can withdraw after deadline
   * @returns Script details object
   * @throws If deadline or public keys are invalid
   * @example
   * const escrow = new EscrowManager();
   * const script = await escrow.createEscrowScript(
   *   1640995200,
   *   userAPublicKey,
   *   userBPublicKey
   * );
   * console.log(script.address);
   */
  async createEscrowScript(
    deadline: number,
    beforePublicKey: Buffer | string,
    afterPublicKey: Buffer | string,
  ): Promise<ScriptInfo> {
    await this.ensureInitialized();

    // Validate inputs using shared utilities
    const deadlineNumber = ValidationUtils.validateLocktime(
      deadline,
      "deadline",
    );
    const beforePubKeyBuffer = KeyUtils.validateAndConvertPublicKey(
      beforePublicKey,
      "beforePublicKey",
    );
    const afterPubKeyBuffer = KeyUtils.validateAndConvertPublicKey(
      afterPublicKey,
      "afterPublicKey",
    );

    // Ensure the public keys are different
    if (beforePubKeyBuffer.equals(afterPubKeyBuffer)) {
      throw new Error("beforePublicKey and afterPublicKey must be different");
    }

    try {
      // Create the escrow script
      // Script logic:
      // IF
      //   <deadline> CHECKLOCKTIMEVERIFY DROP
      //   <afterPublicKey> CHECKSIG
      // ELSE
      //   <beforePublicKey> CHECKSIG
      // ENDIF
      const redeemScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_IF,
        bitcoin.script.number.encode(deadlineNumber),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        afterPubKeyBuffer,
        bitcoin.opcodes.OP_CHECKSIG,
        bitcoin.opcodes.OP_ELSE,
        beforePubKeyBuffer,
        bitcoin.opcodes.OP_CHECKSIG,
        bitcoin.opcodes.OP_ENDIF,
      ]);

      const scriptHash = ScriptUtils.calculateScriptHash(
        Buffer.from(redeemScript),
      );
      const spendInfo = ScriptUtils.deriveTaprootSpendInfo(
        Buffer.from(redeemScript),
        this.network,
      );

      return {
        redeemScript: Buffer.from(redeemScript).toString("hex"),
        scriptHash,
        address: spendInfo.address,
        outputScript: spendInfo.outputScript.toString("hex"),
        controlBlock: spendInfo.controlBlock.toString("hex"),
        internalPubkey: SUNDIAL_NAMESPACE_XONLY.toString("hex"),
        leafVersion: TAPROOT_LEAF_VERSION,
        type: "time-escrow",
        locktime: deadlineNumber,
        beforePublicKey: beforePubKeyBuffer.toString("hex"),
        afterPublicKey: afterPubKeyBuffer.toString("hex"),
      };
    } catch (error) {
      throw new Error(
        `Failed to create escrow script: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Create an unsigned escrow spending transaction
   * @async
   * @param params - Escrow spending parameters
   * @returns Unsigned transaction as base64 PSBT
   * @throws If spending conditions are not met or transaction creation fails
   * @example
   * // Create unsigned transaction for spending before deadline
   * const unsignedTx = await escrow.createEscrowSpendingTransaction({
   *   scriptData,
   *   utxoTxId,
   *   utxoIndex: 0,
   *   amount: 100000,
   *   outputAddress: "tb1qaddr...",
   *   spendAfterDeadline: false
   * });
   *
   * // Create unsigned transaction for spending after deadline
   * const unsignedTx = await escrow.createEscrowSpendingTransaction({
   *   scriptData,
   *   utxoTxId,
   *   utxoIndex: 0,
   *   amount: 100000,
   *   outputAddress: "tb1qaddr...",
   *   spendAfterDeadline: true,
   *   currentTime: Date.now()
   * });
   */
  async createEscrowSpendingTransaction(
    params: EscrowSpendingParams,
  ): Promise<string> {
    await this.ensureInitialized();
    const {
      scriptData,
      utxoTxId,
      utxoIndex,
      amount,
      outputAddress,
      spendAfterDeadline,
      currentTime = Date.now(),
    } = params;

    // Validate inputs
    if (!scriptData || scriptData.type !== "time-escrow") {
      throw new Error("Invalid script data - must be a time-escrow script");
    }

    if (typeof utxoTxId !== "string" || utxoTxId.length !== 64) {
      throw new Error("utxoTxId must be a 64-character hex string");
    }

    if (!Number.isInteger(utxoIndex) || utxoIndex < 0) {
      throw new Error("utxoIndex must be a non-negative integer");
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("amount must be a positive integer");
    }

    if (typeof outputAddress !== "string") {
      throw new Error("outputAddress must be a string");
    }

    // Validate timing for after-deadline spending
    const currentTimeSeconds = Math.floor(currentTime / 1000);
    if (spendAfterDeadline && currentTimeSeconds <= scriptData.locktime!) {
      throw new Error(
        `Cannot spend after deadline yet. Current time: ${currentTimeSeconds}, Deadline: ${scriptData.locktime}`,
      );
    }

    try {
      // Create PSBT for unsigned transaction
      const psbt = new bitcoin.Psbt({ network: this.network });

      // Set locktime and sequence based on spending path
      if (spendAfterDeadline) {
        psbt.locktime = scriptData.locktime!;
      }

      // Add input with Taproot script-path spending data
      const sequence = spendAfterDeadline ? 0xfffffffe : 0xffffffff;
      const redeemScript = Buffer.from(scriptData.redeemScript, "hex");
      const controlBlock = Buffer.from(scriptData.controlBlock!, "hex");

      // Build the P2TR output script for the witnessUtxo
      const outputScript = scriptData.outputScript
        ? Buffer.from(scriptData.outputScript, "hex")
        : ScriptUtils.deriveTaprootSpendInfo(redeemScript, this.network).outputScript;

      psbt.addInput({
        hash: utxoTxId,
        index: utxoIndex,
        sequence,
        witnessUtxo: {
          script: outputScript,
          value: BigInt(amount),
        },
        tapLeafScript: [
          {
            leafVersion: scriptData.leafVersion ?? TAPROOT_LEAF_VERSION,
            script: redeemScript,
            controlBlock,
          },
        ],
      });

      // Add output (subtract a reasonable fee)
      const fee = 1000; // 1000 satoshis fee
      const outputAmount = amount - fee;

      if (outputAmount <= 0) {
        throw new Error("Amount too small to cover fee");
      }

      // Get output script for the destination address
      let destOutputScript: Buffer;
      try {
        destOutputScript = Buffer.from(
          bitcoin.address.toOutputScript(outputAddress, this.network),
        );
      } catch (error) {
        throw new Error(`Invalid output address: ${(error as Error).message}`);
      }

      psbt.addOutput({
        script: destOutputScript,
        value: BigInt(outputAmount),
      });

      // Return unsigned PSBT as base64
      return psbt.toBase64();
    } catch (error) {
      throw new Error(
        `Failed to create spending transaction: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Convenience method to sign and submit an escrow spending transaction
   * @async
   * @param signingParams - Escrow spending signing parameters
   * @param memo - Optional memo for the transaction
   * @returns Transaction result with escrow spending metadata
   */
  async signAndSubmitEscrowSpendingTransaction(
    signingParams: EscrowSpendingSigningParams,
    memo?: string,
  ): Promise<EscrowSpendingTransaction> {
    const privateKeyString =
      typeof signingParams.privateKey === "string"
        ? signingParams.privateKey
        : signingParams.privateKey.toString("hex");

    const signedTx = await this.signTransaction(
      signingParams.unsignedTransaction,
      privateKeyString,
      { spendAfterDeadline: signingParams.spendAfterDeadline },
    );

    const txid = await this.submitTransaction(signedTx, { api: this.api });

    return {
      txHex: signedTx,
      txId: txid,
    };
  }
}
