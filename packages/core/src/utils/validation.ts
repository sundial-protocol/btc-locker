import { assert, assertAll } from "../errors.js";

// Maximum Bitcoin supply expressed in satoshis (21,000,000 BTC × 10^8).
// This is also well within Number.MAX_SAFE_INTEGER, so integer precision
// is guaranteed for all valid values.
const MAX_SATOSHIS = 2_100_000_000_000_000;

/**
 * Common validation utilities
 */
export default class ValidationUtils {
  /**
   * Validate locktime parameter
   * @param locktime - Locktime value
   * @param paramName - Parameter name for error messages
   * @returns Validated locktime as number
   * @throws If locktime is invalid
   */
  static validateLocktime(
    locktime: string | number,
    paramName: string = "locktime",
  ): number {
    const locktimeNumber = Number(locktime);
    assertAll([
      [locktime != null, `${paramName} cannot be undefined or null`],
      [
        Number.isInteger(locktimeNumber) && locktimeNumber >= 0,
        `${paramName} must be a non-negative integer`,
      ],
    ]);
    return locktimeNumber;
  }

  /**
   * Validate amount parameter
   * @param amount - Amount value
   * @param paramName - Parameter name for error messages
   * @param allowZero - Whether to allow zero values
   * @returns Validated amount as number
   * @throws If amount is invalid
   */
  static validateAmount(
    amount: string | number,
    paramName: string = "amount",
    allowZero: boolean = false,
  ): number {
    const amountNumber = Number(amount);
    assertAll([
      [amount != null, `${paramName} cannot be undefined or null`],
      [Number.isInteger(amountNumber), `${paramName} must be an integer`],
      [
        allowZero ? amountNumber >= 0 : amountNumber > 0,
        `${paramName} must be ${allowZero ? "non-negative" : "positive"}`,
      ],
      [
        amountNumber <= MAX_SATOSHIS,
        `${paramName} exceeds maximum Bitcoin supply (${MAX_SATOSHIS} sat)`,
      ],
    ]);
    return amountNumber;
  }

  /**
   * Validate that total input value covers output value and fee
   * @param totalInputValue - Total value of inputs
   * @param outputValue - Value to send
   * @param feeAmount - Transaction fee
   * @throws If insufficient funds
   */
  static validateSufficientFunds(
    totalInputValue: number,
    outputValue: number,
    feeAmount: number,
  ): void {
    const totalRequired = outputValue + feeAmount;
    assert(
      totalInputValue >= totalRequired,
      `Insufficient funds. Required: ${totalRequired} sat, Available: ${totalInputValue} sat`,
    );
  }

  static assertProtocolFeeParams(
    feeAddress: string | undefined,
    protocolFeeAmount: number | undefined,
  ): void {
    assertAll([
      [
        !feeAddress || !!protocolFeeAmount,
        "protocolFeeAmount is required when feeAddress is provided",
      ],
      [
        !protocolFeeAmount || !!feeAddress,
        "feeAddress is required when protocolFeeAmount is provided",
      ],
    ]);
  }
}
