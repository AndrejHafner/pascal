// Left/right asymmetry — see docs/03-training-and-data-model.md "Asymmetry
// tracking": Lattice's own data shows ~1.6kg average difference and they
// decline to set a threshold; the only climbing-adjacent sourced figure is
// 5%. Default threshold is a heuristic, not evidence-based, and must be
// labeled that way in the UI.

export interface AsymmetryResult {
  absoluteDiffKg: number
  /** (stronger - weaker) / stronger, as a fraction. Always >= 0. */
  percentDiff: number
  strongerHand: 'left' | 'right' | 'equal'
  /** Whether percentDiff exceeds the (user-configurable) threshold. */
  exceedsThreshold: boolean
}

export const DEFAULT_ASYMMETRY_THRESHOLD = 0.05

export function computeAsymmetry(
  leftKg: number,
  rightKg: number,
  thresholdFraction: number = DEFAULT_ASYMMETRY_THRESHOLD,
): AsymmetryResult {
  const absoluteDiffKg = Math.abs(leftKg - rightKg)
  const strongerHand: AsymmetryResult['strongerHand'] =
    leftKg === rightKg ? 'equal' : leftKg > rightKg ? 'left' : 'right'

  const strongerKg = Math.max(leftKg, rightKg)
  const percentDiff = strongerKg === 0 ? 0 : absoluteDiffKg / strongerKg

  return {
    absoluteDiffKg,
    percentDiff,
    strongerHand,
    exceedsThreshold: percentDiff > thresholdFraction,
  }
}
