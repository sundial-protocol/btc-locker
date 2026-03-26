import { describe, test, expect } from "vitest";
import ValidationUtils from "../src/utils/validation";

describe("ValidationUtils", () => {
  describe("validateLocktime", () => {
    test("should validate valid integer locktime", () => {
      expect(ValidationUtils.validateLocktime(1000)).toBe(1000);
    });

    test("should validate zero locktime", () => {
      expect(ValidationUtils.validateLocktime(0)).toBe(0);
    });

    test("should validate string locktime", () => {
      expect(ValidationUtils.validateLocktime("500")).toBe(500);
    });

    test("should throw for null locktime", () => {
      expect(() => ValidationUtils.validateLocktime(null as any)).toThrow(
        "locktime cannot be undefined or null",
      );
    });

    test("should throw for undefined locktime", () => {
      expect(() => ValidationUtils.validateLocktime(undefined as any)).toThrow(
        "locktime cannot be undefined or null",
      );
    });

    test("should throw for negative locktime", () => {
      expect(() => ValidationUtils.validateLocktime(-1)).toThrow(
        "locktime must be a non-negative integer",
      );
    });

    test("should throw for float locktime", () => {
      expect(() => ValidationUtils.validateLocktime(1.5)).toThrow(
        "locktime must be a non-negative integer",
      );
    });

    test("should use custom param name in error", () => {
      expect(() => ValidationUtils.validateLocktime(-1, "deadline")).toThrow(
        "deadline must be a non-negative integer",
      );
    });
  });

  describe("validateAmount", () => {
    test("should validate positive integer amount", () => {
      expect(ValidationUtils.validateAmount(1000)).toBe(1000);
    });

    test("should validate string amount", () => {
      expect(ValidationUtils.validateAmount("500")).toBe(500);
    });

    test("should throw for null amount", () => {
      expect(() => ValidationUtils.validateAmount(null as any)).toThrow(
        "amount cannot be undefined or null",
      );
    });

    test("should throw for undefined amount", () => {
      expect(() => ValidationUtils.validateAmount(undefined as any)).toThrow(
        "amount cannot be undefined or null",
      );
    });

    test("should throw for zero amount without allowZero", () => {
      expect(() => ValidationUtils.validateAmount(0)).toThrow(
        "amount must be positive",
      );
    });

    test("should allow zero when allowZero is true", () => {
      expect(ValidationUtils.validateAmount(0, "amount", true)).toBe(0);
    });

    test("should throw for negative amount with allowZero", () => {
      expect(() => ValidationUtils.validateAmount(-1, "amount", true)).toThrow(
        "amount must be non-negative",
      );
    });

    test("should throw for negative amount", () => {
      expect(() => ValidationUtils.validateAmount(-100)).toThrow(
        "amount must be positive",
      );
    });

    test("should throw for float amount", () => {
      expect(() => ValidationUtils.validateAmount(1.5)).toThrow(
        "amount must be an integer",
      );
    });

    test("should use custom param name in error", () => {
      expect(() => ValidationUtils.validateAmount(-1, "feeAmount")).toThrow(
        "feeAmount must be positive",
      );
    });
  });

  describe("validateSufficientFunds", () => {
    test("should not throw when funds are sufficient", () => {
      expect(() =>
        ValidationUtils.validateSufficientFunds(10000, 5000, 1000),
      ).not.toThrow();
    });

    test("should not throw when funds exactly match", () => {
      expect(() =>
        ValidationUtils.validateSufficientFunds(6000, 5000, 1000),
      ).not.toThrow();
    });

    test("should throw when funds are insufficient", () => {
      expect(() =>
        ValidationUtils.validateSufficientFunds(5000, 5000, 1000),
      ).toThrow("Insufficient funds. Required: 6000 sat, Available: 5000 sat");
    });
  });
});
