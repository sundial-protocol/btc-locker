export declare const ORD_URL: string;

/**
 * GET a page from ord as JSON, or `undefined` on 404. Integers too large for a
 * JavaScript number are returned as strings.
 */
export declare function ord<T = unknown>(path: string): Promise<T | undefined>;

/** Wait until ord has indexed up to bitcoind's tip. Returns the height. */
export declare function ordSynced(): Promise<number>;

/** Mine `blocks` blocks to `to`, then wait for ord to index them. */
export declare function mine(blocks: number, to: { address: string }): Promise<number>;

/** Rune balances ord reports for one output: spaced rune name to amount. */
export declare function runeBalances(txid: string, vout: number): Promise<Record<string, bigint>>;
