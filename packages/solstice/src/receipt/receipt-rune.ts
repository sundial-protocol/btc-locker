/**
 * A {@link ReceiptRune} is one Solstice vault instance's receipt token — a
 * fixed-supply Rune, fully premined into the Receipt Vault at launch.
 *
 * Solstice is a multi-instance engine: every instance brands its own receipt Rune
 * (each instance brands its own receipt Rune, e.g. `EXAMPLE•RUNE`). All builders
 * in this package
 * are parameterized by a `ReceiptRune`; nothing here is instance-specific, which
 * is what lets one code path serve every YP instance.
 *
 * Invest and withdraw never mint or burn — they move supply between the Vault and
 * users via edicts — so `totalSupply` is an immutable protocol constant and the
 * Claim Ratio denominator is exactly `totalSupply − (supply still in the Vault)`.
 */

import { runeNameToNumber } from "../runes/rune-name.js";
import type { RuneId } from "../runes/rune-id.js";
import type { Edict, Etching } from "../runes/types.js";

export interface ReceiptRune {
  /** On-chain rune name (A–Z, no spacers), e.g. `"EXAMPLERUNE"`. */
  name: string;
  /** Human display ticker, e.g. `"RT"` — UX only, not on-chain. */
  displayTicker: string;
  /**
   * Rune id (`block:tx`) assigned at etch time (C0) and then frozen. Undefined
   * before the etching transaction has confirmed and its id is known.
   */
  id?: RuneId;
  /** Decimal places (Solstice proposes 8, mirroring BTC). */
  divisibility: number;
  /** Display glyph as a Unicode code point (optional). */
  symbol?: number;
  /** Spacer bitmask for display `•` placement (optional). */
  spacers?: number;
  /** Total premined supply — immutable after etch. */
  totalSupply: bigint;
}

/** Narrowed {@link ReceiptRune} whose etch has confirmed, so `id` is known. */
export type EtchedReceiptRune = ReceiptRune & { id: RuneId };

/** Type guard: has this receipt rune been etched (does it have a frozen id)? */
export function isEtched(rune: ReceiptRune): rune is EtchedReceiptRune {
  return rune.id !== undefined;
}

/** Assert the receipt rune has been etched, returning it with a known `id`. */
export function requireEtched(rune: ReceiptRune): EtchedReceiptRune {
  if (!isEtched(rune)) {
    throw new Error(
      `receipt rune "${rune.name}" has no rune id yet; the C0 etching must confirm first`,
    );
  }
  return rune;
}

/**
 * Build the C0 launch {@link Etching} for a receipt rune: full supply premined,
 * no open-mint terms (closed supply → no dilution), turbo on.
 */
export function receiptEtching(rune: ReceiptRune): Etching {
  if (rune.totalSupply <= 0n) {
    throw new Error("receipt rune totalSupply must be positive");
  }
  if (!Number.isInteger(rune.divisibility) || rune.divisibility < 0 || rune.divisibility > 38) {
    throw new Error("receipt rune divisibility must be an integer in 0..38");
  }
  return {
    rune: runeNameToNumber(rune.name),
    divisibility: rune.divisibility,
    spacers: rune.spacers,
    symbol: rune.symbol,
    premine: rune.totalSupply,
    // No `terms` → closed supply, no open mint.
    turbo: true,
  };
}

/** Build a single edict moving `amount` of this receipt rune to `output`. */
export function receiptEdict(
  rune: ReceiptRune,
  amount: bigint,
  output: number,
): Edict {
  const etched = requireEtched(rune);
  if (amount <= 0n) {
    throw new Error("edict amount must be positive");
  }
  if (!Number.isInteger(output) || output < 0) {
    throw new Error("edict output must be a non-negative integer");
  }
  return { id: etched.id, amount, output };
}
