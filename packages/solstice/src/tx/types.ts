/**
 * Shared transaction-builder types.
 */

import type { UTXO } from "@sundial-protocol/btc-locker";

/** A UTXO that also carries a balance of the receipt rune. */
export interface RuneUtxo extends UTXO {
  /** Amount of the receipt rune held by this output (base units). */
  runeAmount: bigint;
}

/** Default sats attached to a rune-carrying output. Above the 546-sat dust floor. */
export const DEFAULT_RUNE_OUTPUT_VALUE = 546;

/** A concise description of one built output, for inspection and tests. */
export interface BuiltOutput {
  role: string;
  address?: string;
  /** OP_RETURN script hex for the runestone output (when there is no address). */
  scriptHex?: string;
  value: number;
}
