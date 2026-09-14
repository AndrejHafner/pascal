// Fatigue index / decay slope across reps within an Effort — see
// docs/03-training-and-data-model.md "Metrics captured per rep / set": "the
// basis of endurance assessment." Applies to repeater-style efforts with
// multiple reps; a single-rep max-effort test has nothing to decay across
// and returns null.

/**
 * Standard fatigue index formula: (first rep peak - last rep peak) /
 * first rep peak, expressed as a fraction (0 = no decay, 1 = last rep hit
 * zero). Uses first/last rather than a full linear regression slope
 * because it's simpler, more interpretable in the UI ("you dropped X%"),
 * and standard in the all-out-test literature docs/03 cites for Critical
 * Force (Fpeak/Favg/FI alongside each other).
 */
export function computeFatigueIndex(repPeaksKg: number[]): number | null {
  if (repPeaksKg.length < 2) return null

  const first = repPeaksKg[0]
  const last = repPeaksKg[repPeaksKg.length - 1]

  if (first === 0) return null // avoid divide-by-zero; a zero-force first rep is degenerate data

  return (first - last) / first
}
