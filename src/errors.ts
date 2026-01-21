/**
 * Error classes for better error handling
 */
export class BTCLockerError extends Error {
  public code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "BTCLockerError";
    this.code = code;
  }
}

export class ValidationError extends BTCLockerError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class TimelockError extends BTCLockerError {
  constructor(message: string) {
    super(message, "TIMELOCK_ERROR");
    this.name = "TimelockError";
  }
}