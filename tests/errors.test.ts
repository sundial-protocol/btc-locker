import { describe, test, expect } from "vitest";
import { BTCLockerError, ValidationError, TimelockError } from "../src/errors";

describe("Error Classes", () => {
  describe("BTCLockerError", () => {
    test("should create error with message", () => {
      const error = new BTCLockerError("test error");
      expect(error.message).toBe("test error");
      expect(error.name).toBe("BTCLockerError");
      expect(error.code).toBeUndefined();
      expect(error).toBeInstanceOf(Error);
    });

    test("should create error with message and code", () => {
      const error = new BTCLockerError("test error", "TEST_CODE");
      expect(error.message).toBe("test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.name).toBe("BTCLockerError");
    });
  });

  describe("ValidationError", () => {
    test("should create validation error", () => {
      const error = new ValidationError("invalid input");
      expect(error.message).toBe("invalid input");
      expect(error.name).toBe("ValidationError");
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error).toBeInstanceOf(BTCLockerError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("TimelockError", () => {
    test("should create timelock error", () => {
      const error = new TimelockError("timelock not expired");
      expect(error.message).toBe("timelock not expired");
      expect(error.name).toBe("TimelockError");
      expect(error.code).toBe("TIMELOCK_ERROR");
      expect(error).toBeInstanceOf(BTCLockerError);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
