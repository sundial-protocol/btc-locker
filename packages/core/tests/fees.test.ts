import { describe, test, expect } from "vitest";
import FeeUtils from "../src/utils/fees";
import { FeePriorities } from "../src/utils/fees";

describe("FeeUtils", () => {
  describe("constants", () => {
    test("should have DUST_THRESHOLD constant", () => {
      expect(FeeUtils.DUST_THRESHOLD).toBe(546);
    });

    test("should have DEFAULT_FEE constant", () => {
      expect(FeeUtils.DEFAULT_FEE).toBe(1000);
    });
  });

  describe("FeePriorities enum", () => {
    test("should have HIGH, MEDIUM, LOW values", () => {
      expect(FeePriorities.HIGH).toBe("high");
      expect(FeePriorities.MEDIUM).toBe("medium");
      expect(FeePriorities.LOW).toBe("low");
    });
  });

  describe("calculateChange", () => {
    test("should calculate change above dust threshold", () => {
      const result = FeeUtils.calculateChange(100000, 50000, 1000);
      expect(result.changeAmount).toBe(49000);
      expect(result.isAboveDustThreshold).toBe(true);
      expect(result.adjustedFee).toBe(1000);
    });

    test("should return zero change when below dust threshold", () => {
      const result = FeeUtils.calculateChange(51000, 50000, 500);
      expect(result.changeAmount).toBe(0);
      expect(result.isAboveDustThreshold).toBe(false);
      expect(result.adjustedFee).toBe(1000); // 500 + 500 change added to fee
    });

    test("should handle zero change", () => {
      const result = FeeUtils.calculateChange(51000, 50000, 1000);
      expect(result.changeAmount).toBe(0);
      expect(result.isAboveDustThreshold).toBe(false);
      expect(result.adjustedFee).toBe(1000); // zero change, no adjustment
    });

    test("should handle negative change (underfunded)", () => {
      const result = FeeUtils.calculateChange(1000, 50000, 1000);
      expect(result.changeAmount).toBe(0);
      expect(result.isAboveDustThreshold).toBe(false);
    });

    test("should use default fee when not specified", () => {
      const result = FeeUtils.calculateChange(100000, 50000);
      expect(result.changeAmount).toBe(49000);
      expect(result.adjustedFee).toBe(1000);
    });
  });

  describe("estimateFee", () => {
    test("should estimate fee for 1 input, 1 output", () => {
      const fee = FeeUtils.estimateFee(1, 1, 10);
      // (1*150 + 1*34 + 10) * 10 = 1940
      expect(fee).toBe(1940);
    });

    test("should estimate fee for multiple inputs and outputs", () => {
      const fee = FeeUtils.estimateFee(3, 2, 5);
      // (3*150 + 2*34 + 10) * 5 = (450+68+10)*5 = 2640
      expect(fee).toBe(2640);
    });

    test("should use default fee rate of 10", () => {
      const fee = FeeUtils.estimateFee(1, 1);
      expect(fee).toBe(1940);
    });
  });
});
