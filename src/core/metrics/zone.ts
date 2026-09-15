// Zone classification shared between the chart and any other UI that needs
// to know "what color should this be right now" — see docs/04's "The plot
// changes color with zone state" and docs/05's zone color table. Kept
// separate from tut.ts's zone-of logic only in that this is the live,
// single-sample classification used for real-time rendering; tut.ts's
// internal zoneOf is the same rule applied while summing durations. Both
// must agree, so this re-exports the identical boundary semantics.

import type { Band } from './band'

export type Zone = 'below' | 'in' | 'above'

/** [target - tolerance, target + tolerance] inclusive is 'in'. Matches tut.ts exactly. */
export function classifyZone(forceKg: number, band: Band): Zone {
  const lower = band.targetKg - band.toleranceKg
  const upper = band.targetKg + band.toleranceKg
  if (forceKg < lower) return 'below'
  if (forceKg > upper) return 'above'
  return 'in'
}
