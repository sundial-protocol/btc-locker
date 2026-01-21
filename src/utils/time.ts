/**
 * Time and date utilities
 */
export default class TimeUtils {
  /**
   * Convert date to Unix timestamp
   * @param date - Date object or date string
   * @returns Unix timestamp
   */
  static dateToTimestamp(date: Date | string): number {
    if (typeof date === "string") {
      date = new Date(date);
    }
    return Math.floor(date.getTime() / 1000);
  }

  /**
   * Convert Unix timestamp to Date
   * @param timestamp - Unix timestamp
   * @returns Date object
   */
  static timestampToDate(timestamp: number): Date {
    return new Date(timestamp * 1000);
  }

  /**
   * Add time duration to current timestamp
   * @param duration - Duration in seconds
   * @param baseTime - Base timestamp (optional, defaults to now)
   * @returns Future timestamp
   */
  static addDuration(duration: number, baseTime: number = Math.floor(Date.now() / 1000)): number {
    return baseTime + duration;
  }

  /**
   * Common time durations in seconds
   */
  static get DURATIONS() {
    return {
      MINUTE: 60,
      HOUR: 3600,
      DAY: 86400,
      WEEK: 604800,
      MONTH: 2592000, // 30 days
      YEAR: 31536000, // 365 days
    } as const;
  }

  /**
   * Convert blocks to approximate time duration
   * @param blocks - Number of blocks
   * @param blockTime - Average block time in seconds (default: 600 for Bitcoin)
   * @returns Duration in seconds
   */
  static blocksToSeconds(blocks: number, blockTime: number = 600): number {
    return blocks * blockTime;
  }
}