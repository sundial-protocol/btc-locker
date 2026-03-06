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
    if (locktime === undefined || locktime === null) {
      throw new Error(`${paramName} cannot be undefined or null`);
    }

    const locktimeNumber = Number(locktime);
    if (!Number.isInteger(locktimeNumber) || locktimeNumber < 0) {
      throw new Error(`${paramName} must be a non-negative integer`);
    }

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
    if (amount === undefined || amount === null) {
      throw new Error(`${paramName} cannot be undefined or null`);
    }

    const amountNumber = Number(amount);
    if (!Number.isInteger(amountNumber)) {
      throw new Error(`${paramName} must be an integer`);
    }

    if (allowZero ? amountNumber < 0 : amountNumber <= 0) {
      throw new Error(
        `${paramName} must be ${allowZero ? "non-negative" : "positive"}`,
      );
    }

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
    if (totalInputValue < totalRequired) {
      throw new Error(
        `Insufficient funds. Required: ${totalRequired} sat, Available: ${totalInputValue} sat`,
      );
    }
  }
}
