/**
 * @sundial-protocol/solstice
 *
 * Receipt-token (Runes) + atomic-swap layer for the Solstice value-accrual vault.
 * Reuses `@sundial-protocol/btc-locker` for scripts, PSBT construction, fees, UTXO
 * selection and signing; this package adds the greenfield Runes token layer and the
 * atomic BTC⇄RT swap that btc-locker does not provide.
 *
 * Spec component coverage (Solstice Technical Specification):
 *   • C0  Token Inscription  → {@link buildEtchCommitTransaction}, then
 *                              {@link buildEtchTransaction} six blocks later
 *   • C1  Investment         → {@link buildInvestTransaction}   (generic swap)
 *   • C2  Standard Withdrawal→ {@link buildWithdrawTransaction} (generic swap)
 *   • Cenotaph guard (Runes record) → {@link encipherGuarded}
 *
 * Chain access: {@link Solstice} holds a network and a `BitcoinAPI`, as
 * btc-locker's `BTCLocker` does, and wraps the builders with the funding, fee
 * rate, commit checks and broadcast they need. The builders stay pure.
 *
 * Multi-instance: every builder is parameterized by a {@link ReceiptRune}, so one
 * code path serves every YP instance (each brands its own receipt Rune). YP type
 * (BTC-returning vs asset-backed) does not reach this layer —
 * it only changes the BTC deployment destination, which is a plain parameter.
 */

// ── Runes primitives and runestone codec ─────────────────────────────────────
// These live in @sundial-protocol/btc-runes. They are re-exported so code that
// imports them from this package keeps working.
export {
  encodeVarint,
  decodeVarint,
  decodeAllVarints,
  U128_MAX,
  LARGEST_RUNE_NAME,
  runeNameToNumber,
  numberToRuneName,
  runeCommitment,
  parseSpacedRune,
  formatSpacedRune,
  RUNE_ID_ZERO,
  formatRuneId,
  parseRuneId,
  runeIdEquals,
  compareRuneId,
  runeIdDelta,
  runeIdFromDelta,
  Tag,
  Flag,
  flagMask,
  RUNESTONE_MAGIC,
  MAX_DIVISIBILITY,
  MAX_SPACERS,
  NativeRunestoneCodec,
  nativeRunestoneCodec,
  encipherGuarded,
  CenotaphError,
  type DecodedVarint,
  type RuneId,
  type Flaw,
  type DecipherContext,
  type Terms,
  type Etching,
  type Edict,
  type Runestone,
  type DecipherResult,
  type RunestoneCodec,
} from "@sundial-protocol/btc-runes";

// ── Receipt rune (per-instance) ──────────────────────────────────────────────
export {
  isEtched,
  requireEtched,
  receiptEtching,
  receiptEdict,
  type ReceiptRune,
  type EtchedReceiptRune,
} from "./receipt/receipt-rune.js";

// ── Chain-connected entry point ──────────────────────────────────────────────
export {
  Solstice,
  type FeeOptions,
  type SolsticeEtchCommitParams,
  type SolsticeEtchParams,
  type SolsticeSwapParams,
  type SolsticeInvestParams,
  type SolsticeWithdrawParams,
} from "./solstice.js";

// ── Transaction builders ─────────────────────────────────────────────────────
export {
  DEFAULT_RUNE_OUTPUT_VALUE,
  type RuneUtxo,
  type BuiltOutput,
} from "./tx/types.js";
export {
  ETCH_COMMIT_CONFIRMATIONS,
  createEtchCommitment,
  buildEtchCommitTransaction,
  type EtchCommitment,
  type EtchCommitParams,
  type EtchCommitResult,
} from "./tx/etch-commit.js";
export {
  buildEtchTransaction,
  type EtchCommitInput,
  type EtchParams,
  type EtchResult,
} from "./tx/etch.js";
export {
  buildSwapTransaction,
  buildInvestTransaction,
  buildWithdrawTransaction,
  type SwapParams,
  type SwapResult,
  type RtLeg,
  type BtcLeg,
  type InvestParams,
  type WithdrawParams,
} from "./tx/swap.js";
