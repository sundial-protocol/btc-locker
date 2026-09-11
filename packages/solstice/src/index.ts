/**
 * @sundial-protocol/solstice
 *
 * Receipt-token (Runes) + atomic-swap layer for the Solstice value-accrual vault.
 * Reuses `@sundial-protocol/btc-locker` for scripts, PSBT construction, fees, UTXO
 * selection and signing; this package adds the greenfield Runes token layer and the
 * atomic BTC⇄RT swap that btc-locker does not provide.
 *
 * Spec component coverage (Solstice Technical Specification):
 *   • C0  Token Inscription  → {@link buildEtchTransaction}
 *   • C1  Investment         → {@link buildInvestTransaction}   (generic swap)
 *   • C2  Standard Withdrawal→ {@link buildWithdrawTransaction} (generic swap)
 *   • Cenotaph guard (Runes record) → {@link encipherGuarded}
 *
 * Multi-instance: every builder is parameterized by a {@link ReceiptRune}, so one
 * code path serves every YP instance (each brands its own receipt Rune). YP type
 * (BTC-returning vs asset-backed) does not reach this layer —
 * it only changes the BTC deployment destination, which is a plain parameter.
 */

// ── Runes primitives ─────────────────────────────────────────────────────────
export {
  encodeVarint,
  decodeVarint,
  decodeAllVarints,
  U128_MAX,
  type DecodedVarint,
} from "./runes/varint.js";
export { runeNameToNumber, numberToRuneName } from "./runes/rune-name.js";
export {
  RUNE_ID_ZERO,
  formatRuneId,
  parseRuneId,
  runeIdEquals,
  compareRuneId,
  runeIdDelta,
  runeIdFromDelta,
  type RuneId,
} from "./runes/rune-id.js";
export {
  Tag,
  Flag,
  flagMask,
  RUNESTONE_MAGIC,
  type Terms,
  type Etching,
  type Edict,
  type Runestone,
  type DecipherResult,
} from "./runes/types.js";

// ── Runestone codec (pluggable) ──────────────────────────────────────────────
export type { RunestoneCodec } from "./runes/codec.js";
export { NativeRunestoneCodec, nativeRunestoneCodec } from "./runes/native-codec.js";
export { encipherGuarded, CenotaphError } from "./runes/guard.js";

// ── Receipt rune (per-instance) ──────────────────────────────────────────────
export {
  isEtched,
  requireEtched,
  receiptEtching,
  receiptEdict,
  type ReceiptRune,
  type EtchedReceiptRune,
} from "./receipt/receipt-rune.js";

// ── Transaction builders ─────────────────────────────────────────────────────
export {
  DEFAULT_RUNE_OUTPUT_VALUE,
  type RuneUtxo,
  type BuiltOutput,
} from "./tx/types.js";
export {
  buildEtchTransaction,
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
