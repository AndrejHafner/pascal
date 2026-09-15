// Pairs left/right MaxRecords into asymmetry-trend points — see
// docs/04-screens-and-ux.md "Progress": "Asymmetry trend — L/R difference
// over time, with the threshold drawn as a reference line." MaxRecords for
// each hand are separate rows (see docs/03 "Single-handed work must still
// be representable" — a hand's max is never required to have a same-day
// twin), so pairing is done by nearest-in-time match rather than assuming
// a 1:1 structural relationship.

import { computeAsymmetry } from '../metrics/asymmetry'
import type { AsymmetryResult } from '../metrics/asymmetry'
import type { MaxRecordLike } from '../protocol/prescription'

export interface AsymmetryTrendPoint {
  /** The later of the two paired records' timestamps — when this comparison became available. */
  timestampMs: number
  asymmetry: AsymmetryResult
}

/**
 * Greedy nearest-time pairing: for each left record, the closest right
 * record within `maxPairGapMs` (default 24h — same session/day) becomes
 * its pair. A right record is used at most once. Left records with no
 * close-enough right record are skipped — asymmetry needs both hands, and
 * a session with only one hand tested (per docs/03, deliberately valid)
 * contributes no trend point rather than a fabricated comparison.
 */
export function pairForAsymmetryTrend(
  leftRecords: MaxRecordLike[],
  rightRecords: MaxRecordLike[],
  thresholdFraction?: number,
  maxPairGapMs: number = 24 * 60 * 60 * 1000,
): AsymmetryTrendPoint[] {
  const usedRightIndices = new Set<number>()
  const points: AsymmetryTrendPoint[] = []

  for (const left of leftRecords) {
    let bestIndex = -1
    let bestGapMs = Infinity
    for (let i = 0; i < rightRecords.length; i++) {
      if (usedRightIndices.has(i)) continue
      const gapMs = Math.abs(rightRecords[i].recordedAt - left.recordedAt)
      if (gapMs < bestGapMs) {
        bestGapMs = gapMs
        bestIndex = i
      }
    }
    if (bestIndex === -1 || bestGapMs > maxPairGapMs) continue

    usedRightIndices.add(bestIndex)
    const right = rightRecords[bestIndex]
    points.push({
      timestampMs: Math.max(left.recordedAt, right.recordedAt),
      asymmetry: computeAsymmetry(left.forceKg, right.forceKg, thresholdFraction),
    })
  }

  return points.sort((a, b) => a.timestampMs - b.timestampMs)
}
