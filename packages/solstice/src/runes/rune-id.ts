/**
 * A Rune ID identifies an etched rune by the block height and transaction index
 * of its etching: `block:tx`. It is assigned at etch time (C0) and then frozen as
 * a protocol constant for the instance.
 */
export interface RuneId {
  block: bigint;
  tx: bigint;
}

const U64_MAX = (1n << 64n) - 1n;
const U32_MAX = (1n << 32n) - 1n;

/** The zero id `0:0`, used as the base for edict delta-encoding. */
export const RUNE_ID_ZERO: RuneId = { block: 0n, tx: 0n };

/** Format a rune id as the canonical `block:tx` string. */
export function formatRuneId(id: RuneId): string {
  return `${id.block}:${id.tx}`;
}

/**
 * Parse a `block:tx` string into a {@link RuneId}.
 * @throws unless both parts are decimal digits forming an id ord accepts.
 */
export function parseRuneId(s: string): RuneId {
  // Decimal digits only. BigInt() alone would read "" as 0 and accept hex,
  // whitespace and signs, so a typo could silently name another rune.
  const match = /^(\d+):(\d+)$/.exec(s);
  if (!match) {
    throw new Error(`invalid rune id "${s}": expected "block:tx" in decimal digits`);
  }
  const block = BigInt(match[1]);
  const tx = BigInt(match[2]);
  if (block > U64_MAX || tx > U32_MAX) {
    throw new Error(`invalid rune id "${s}": block must fit in a u64 and tx in a u32`);
  }
  if (block === 0n && tx > 0n) {
    throw new Error(`invalid rune id "${s}": block 0 is only valid with tx 0`);
  }
  return { block, tx };
}

/** Structural equality for rune ids. */
export function runeIdEquals(a: RuneId, b: RuneId): boolean {
  return a.block === b.block && a.tx === b.tx;
}

/** Ascending sort comparator: by block, then tx. */
export function compareRuneId(a: RuneId, b: RuneId): number {
  if (a.block !== b.block) return a.block < b.block ? -1 : 1;
  if (a.tx !== b.tx) return a.tx < b.tx ? -1 : 1;
  return 0;
}

/**
 * Delta-encode `next` relative to `previous` for edict serialization.
 * Returns `[blockDelta, txValue]` where `txValue` is the raw tx index when the
 * block advances, or the tx delta when it does not — matching `ord`.
 */
export function runeIdDelta(previous: RuneId, next: RuneId): [bigint, bigint] {
  const block = next.block - previous.block;
  const tx = block === 0n ? next.tx - previous.tx : next.tx;
  return [block, tx];
}

/** Inverse of {@link runeIdDelta}: reconstruct `next` from a decoded delta pair. */
export function runeIdFromDelta(
  previous: RuneId,
  blockDelta: bigint,
  txValue: bigint,
): RuneId {
  const block = previous.block + blockDelta;
  const tx = blockDelta === 0n ? previous.tx + txValue : txValue;
  return { block, tx };
}
