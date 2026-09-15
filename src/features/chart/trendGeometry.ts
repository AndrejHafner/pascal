// Pure geometry for TrendChart (progression / asymmetry-trend / training-
// load charts) — a date-indexed line+point chart, distinct from
// chartGeometry.ts's time-within-one-effort force curve. Kept separate and
// unit-testable for the same reason: see docs/05-design.md "Progression
// charts: line + small point markers... Sparse data is the normal early
// state. One point renders as a labeled dot, not an empty or broken chart."

export interface TrendPoint {
  /** Epoch ms — the X axis is always calendar time. */
  timestampMs: number
  value: number
}

export interface TrendDimensions {
  width: number
  height: number
}

export interface TrendScale {
  minValue: number
  maxValue: number
  minTimestampMs: number
  maxTimestampMs: number
}

/**
 * Y always starts at 0 (force/TUT/impulse/asymmetry are all naturally
 * zero-based, and a non-zero-based axis would visually exaggerate small
 * differences — see docs/05's "never mislead" instinct applied elsewhere
 * to the live chart's non-shrinking Y axis). `referenceValue` (e.g. an
 * asymmetry threshold line) is folded into the max so the reference line
 * itself never clips off-chart.
 */
export function computeTrendScale(points: TrendPoint[], referenceValue?: number): TrendScale {
  if (points.length === 0) {
    return { minValue: 0, maxValue: 1, minTimestampMs: 0, maxTimestampMs: 1 }
  }
  const values = points.map((p) => p.value)
  const timestamps = points.map((p) => p.timestampMs)
  const maxValue = Math.max(...values, referenceValue ?? 0) * 1.15 || 1

  return {
    minValue: 0,
    maxValue,
    minTimestampMs: Math.min(...timestamps),
    maxTimestampMs: Math.max(...timestamps),
  }
}

export function trendPointToXY(
  point: TrendPoint,
  scale: TrendScale,
  dimensions: TrendDimensions,
): { x: number; y: number } {
  // A single point (or all points sharing one timestamp) has no time
  // range to spread across — center it rather than divide by zero.
  const timeRange = scale.maxTimestampMs - scale.minTimestampMs
  const x =
    timeRange === 0
      ? dimensions.width / 2
      : ((point.timestampMs - scale.minTimestampMs) / timeRange) * dimensions.width

  const valueRange = scale.maxValue - scale.minValue
  const y =
    valueRange === 0
      ? dimensions.height
      : dimensions.height - ((point.value - scale.minValue) / valueRange) * dimensions.height

  return { x, y }
}

export function valueToY(value: number, scale: TrendScale, dimensions: TrendDimensions): number {
  const valueRange = scale.maxValue - scale.minValue
  if (valueRange === 0) return dimensions.height
  return dimensions.height - ((value - scale.minValue) / valueRange) * dimensions.height
}
