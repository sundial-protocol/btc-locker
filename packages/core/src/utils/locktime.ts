/**
 * Locktime checks against the chain, the way consensus makes them.
 *
 * A transaction's nLockTime below 500,000,000 is a block height; from there up
 * it is a Unix time. A node accepts the transaction into the next block only
 * when the locktime is below that block's height, or below the median time
 * past of the tip (BIP 113), which runs about an hour behind the clock.
 */

import type { ChainTip } from "@sundial-protocol/btc-provider";

/** The tip values a locktime is compared with. */
export type LocktimeTip = Pick<ChainTip, "height" | "medianTimePast">;

/** Something that can report the chain tip: the locker's `BitcoinAPI`. */
export interface ChainTipSource {
  getChainTip(): Promise<LocktimeTip>;
}

export default class LocktimeUtils {
  /** nLockTime values from here up are Unix times; below are block heights. */
  static readonly THRESHOLD = 500_000_000;

  static isHeight(locktime: number): boolean {
    return locktime < this.THRESHOLD;
  }

  /**
   * Whether a transaction with this nLockTime can be mined in the block after
   * `tip`. A height locktime N needs the tip at N or above (the transaction
   * goes in block N + 1 at the earliest); a time locktime needs the median
   * time past strictly above it.
   */
  static isFinal(locktime: number, tip: LocktimeTip): boolean {
    return this.isHeight(locktime)
      ? locktime <= tip.height
      : locktime < tip.medianTimePast;
  }

  /**
   * The tip values needed to check `locktimes`, taking what `given` has and
   * asking `api` for the rest. Asks nothing when every locktime is 0 or
   * `given` already covers them.
   */
  static async tipFor(
    api: ChainTipSource,
    locktimes: number[],
    given: Partial<LocktimeTip> = {},
  ): Promise<LocktimeTip> {
    const active = locktimes.filter((locktime) => locktime > 0);
    const needHeight =
      active.some((l) => this.isHeight(l)) && given.height === undefined;
    const needTime =
      active.some((l) => !this.isHeight(l)) &&
      given.medianTimePast === undefined;
    const fetched =
      needHeight || needTime ? await api.getChainTip() : undefined;
    return {
      height: given.height ?? fetched?.height ?? 0,
      medianTimePast: given.medianTimePast ?? fetched?.medianTimePast ?? 0,
    };
  }

  /**
   * Why a locktime is not yet final, for an error message: what the chain
   * is at and what it has to reach.
   */
  static describeWait(locktime: number, tip: LocktimeTip): string {
    if (this.isHeight(locktime)) {
      return (
        `Chain height: ${tip.height}, Locktime: block ${locktime}. ` +
        `Spendable once block ${locktime} is mined (${locktime - tip.height} more).`
      );
    }
    return (
      `Median time past: ${tip.medianTimePast}, Locktime: ${locktime}. ` +
      `Spendable once the median time past passes ${new Date(
        locktime * 1000,
      ).toISOString()}, about an hour after that time on the clock.`
    );
  }

  /**
   * Throw unless every locktime is final against the chain tip.
   *
   * @param prefix - Starts the error message, e.g. "Timelock has not expired yet."
   * @param given - Tip values to use instead of asking the API.
   */
  static async assertFinal(
    api: ChainTipSource,
    locktimes: number[],
    prefix: string,
    given?: Partial<LocktimeTip>,
  ): Promise<void> {
    const tip = await this.tipFor(api, locktimes, given);
    for (const locktime of locktimes) {
      if (locktime > 0 && !this.isFinal(locktime, tip)) {
        throw new Error(`${prefix} ${this.describeWait(locktime, tip)}`);
      }
    }
  }
}
