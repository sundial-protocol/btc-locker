/**
 * Fee rates by priority, worked out from a provider's fee estimates.
 */

/**
 * Fee priority levels for user-friendly fee selection
 */
export enum FeePriorities {
  /** Fast confirmation (next block) */
  HIGH = "high",
  /** Medium confirmation (~6 blocks) */
  MEDIUM = "medium",
  /** Slow confirmation (~1 day) */
  LOW = "low",
}

/**
 * Pick the rate for a priority out of fee estimates keyed by confirmation
 * target in blocks, in sat/vB.
 */
export function feeRateForPriority(
  feeEstimates: { [blocks: number]: number },
  priority: FeePriorities,
): number {
  // Convert raw fee estimates to user-friendly priorities
  const result = {
    high: 0,
    medium: 0,
    low: 0,
  };

  // Map common block targets to priorities
  // Look for closest matches to standard confirmation targets
  const blockTargets = Object.keys(feeEstimates)
    .map(Number)
    .sort((a, b) => a - b);

  // No estimates is no answer: the caller's fallback, if any, applies.
  if (blockTargets.length === 0) {
    throw new Error("The provider returned no fee estimates.");
  }

  // High priority: 1-2 blocks (next block confirmation)
  result.high = feeEstimates[blockTargets[0]];

  // Medium priority: 3-6 blocks
  const mediumTarget = blockTargets.find((target) => target >= 3 && target <= 6);
  result.medium = mediumTarget
    ? feeEstimates[mediumTarget]
    : feeEstimates[6] || result.high * 0.7;

  // Low priority: 12+ blocks (lower cost)
  const lowTarget = blockTargets.find((target) => target >= 12);
  result.low = lowTarget
    ? feeEstimates[lowTarget]
    : feeEstimates[144] || result.medium * 0.5;

  // Ensure fees are reasonable (min 1 sat/byte, max 1000 sat/byte)
  result.high = Math.min(Math.max(Math.ceil(result.high), 1), 1000);
  result.medium = Math.min(Math.max(Math.ceil(result.medium), 1), 1000);
  result.low = Math.min(Math.max(Math.ceil(result.low), 1), 1000);

  switch (priority) {
    case FeePriorities.HIGH:
      return result.high;
    case FeePriorities.MEDIUM:
      return result.medium;
    case FeePriorities.LOW:
      return result.low;
    default:
      return result.medium;
  }
}
