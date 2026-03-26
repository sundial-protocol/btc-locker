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

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertAll(checks: [boolean, string][]): void {
  for (const [condition, message] of checks) {
    assert(condition, message);
  }
}
