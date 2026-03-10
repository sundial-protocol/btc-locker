import { describe, test, expect } from "vitest";
import TimeUtils from "../src/utils/time";

describe("TimeUtils", () => {
  describe("dateToTimestamp", () => {
    test("should convert Date object to unix timestamp", () => {
      const date = new Date("2024-06-15T12:00:00Z");
      const timestamp = TimeUtils.dateToTimestamp(date);
      expect(timestamp).toBe(Math.floor(date.getTime() / 1000));
    });

    test("should convert date string to unix timestamp", () => {
      const timestamp = TimeUtils.dateToTimestamp("2024-01-01T00:00:00Z");
      expect(timestamp).toBe(1704067200);
    });
  });

  describe("timestampToDate", () => {
    test("should convert unix timestamp to Date", () => {
      const date = TimeUtils.timestampToDate(1704067200);
      expect(date).toBeInstanceOf(Date);
      expect(date.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    });

    test("should handle zero timestamp", () => {
      const date = TimeUtils.timestampToDate(0);
      expect(date.toISOString()).toBe("1970-01-01T00:00:00.000Z");
    });
  });

  describe("addDuration", () => {
    test("should add duration to base time", () => {
      const result = TimeUtils.addDuration(3600, 1000);
      expect(result).toBe(4600);
    });

    test("should default to current time when no base given", () => {
      const before = Math.floor(Date.now() / 1000);
      const result = TimeUtils.addDuration(100);
      const after = Math.floor(Date.now() / 1000);
      expect(result).toBeGreaterThanOrEqual(before + 100);
      expect(result).toBeLessThanOrEqual(after + 100);
    });
  });

  describe("DURATIONS", () => {
    test("should have correct duration constants", () => {
      const d = TimeUtils.DURATIONS;
      expect(d.MINUTE).toBe(60);
      expect(d.HOUR).toBe(3600);
      expect(d.DAY).toBe(86400);
      expect(d.WEEK).toBe(604800);
      expect(d.MONTH).toBe(2592000);
      expect(d.YEAR).toBe(31536000);
    });
  });

  describe("blocksToSeconds", () => {
    test("should convert blocks to seconds with default block time", () => {
      expect(TimeUtils.blocksToSeconds(144)).toBe(86400);
    });

    test("should convert blocks with custom block time", () => {
      expect(TimeUtils.blocksToSeconds(10, 300)).toBe(3000);
    });

    test("should handle zero blocks", () => {
      expect(TimeUtils.blocksToSeconds(0)).toBe(0);
    });
  });
});
