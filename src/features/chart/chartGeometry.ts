// Pure geometry helpers for ForceChart — kept separate from the component
// so the coordinate math and segment-building logic are unit-testable
// without rendering anything. See docs/05-design.md "Live force curve" and
// docs/07-architecture.md "Charts".

import type { Band } from '../../core/metrics/band'
import { classifyZone, type Zone } from '../../core/metrics/zone'

export interface ChartSample {
  offsetMs: number
  forceKg: number
}

export interface ChartDimensions {
  width: number
  height: number
}

export interface YScale {
  minKg: number
  maxKg: number
}

/**
 * Y axis auto-scales to max(peak so far, target + tolerance) * 1.15 and
 * NEVER rescales downward mid-set — per docs/05: "a shrinking axis makes a
 * consistent pull look like it's climbing, which is actively misleading."
 * `previousMaxKg` is the caller's latched high-water mark; pass it back in
 * on every call so the scale only ever grows.
 */
export function computeLatchedYScale(
  peakSoFarKg: number,
  band: Band | null,
  previousMaxKg: number,
): YScale {
  const bandCeiling = band ? band.targetKg + band.toleranceKg : 0
  const naturalMax = Math.max(peakSoFarKg, bandCeiling) * 1.15
  const maxKg = Math.max(naturalMax, previousMaxKg)
  return { minKg: 0, maxKg }
}

/** Maps a force value to a Y pixel coordinate (0 at top, height at bottom — SVG/Skia convention). */
export function forceToY(forceKg: number, scale: YScale, dimensions: ChartDimensions): number {
  if (scale.maxKg <= scale.minKg) return dimensions.height
  const fraction = (forceKg - scale.minKg) / (scale.maxKg - scale.minKg)
  return dimensions.height - fraction * dimensions.height
}

/** Maps a sample's offset within the trailing window to an X pixel coordinate. */
export function offsetToX(
  offsetMs: number,
  windowStartMs: number,
  windowMs: number,
  dimensions: ChartDimensions,
): number {
  const fraction = (offsetMs - windowStartMs) / windowMs
  return fraction * dimensions.width
}

/**
 * Live mode only: the current sample is plotted at this fraction of the
 * chart's width rather than pinned to the right edge — per docs/05's
 * general "give the eye room" instinct, extended here: a trace stuck to
 * x=width reads as if it's constantly falling off a cliff. Anything drawn
 * is always real history (the empty space past the current point stays
 * blank, never extrapolated) — this only changes where "now" sits
 * horizontally, not what data exists.
 */
export const LIVE_NOW_X_FRACTION = 0.7

/**
 * Widens the trailing window so the requested `historyMs` of history still
 * fits between the left edge and "now," while "now" itself lands at
 * `nowFraction` of the width instead of the right edge — the rest of the
 * width (from nowFraction to 1) stays blank margin. Returns the effective
 * windowStartMs/windowMs to pass into offsetToX/buildTraceSegments.
 */
export function computeLiveWindow(
  nowOffsetMs: number,
  historyMs: number,
  nowFraction: number = LIVE_NOW_X_FRACTION,
): { windowStartMs: number; windowMs: number } {
  const windowStartMs = nowOffsetMs - historyMs
  const windowMs = nowFraction > 0 ? historyMs / nowFraction : historyMs
  return { windowStartMs, windowMs }
}

export interface TraceSegment {
  zone: Zone
  points: { x: number; y: number }[]
}

/**
 * Splits a sample sequence into contiguous same-zone runs — "zone coloring
 * is per-segment... the trace is drawn as segments colored by the zone
 * state at the time each was recorded, so history keeps its original
 * colors" (docs/07). Each segment includes one point of overlap with its
 * neighbor so consecutive path segments connect with no visible gap.
 */
export function buildTraceSegments(
  samples: ChartSample[],
  band: Band,
  windowStartMs: number,
  windowMs: number,
  scale: YScale,
  dimensions: ChartDimensions,
): TraceSegment[] {
  if (samples.length === 0) return []

  const segments: TraceSegment[] = []
  let currentZone: Zone | null = null
  let currentPoints: { x: number; y: number }[] = []

  for (const sample of samples) {
    const zone = classifyZone(sample.forceKg, band)
    const point = {
      x: offsetToX(sample.offsetMs, windowStartMs, windowMs, dimensions),
      y: forceToY(sample.forceKg, scale, dimensions),
    }

    if (zone !== currentZone) {
      if (currentPoints.length > 0) {
        // Include this point in the outgoing segment too, so segments join
        // without a gap at the zone-transition boundary.
        segments.push({ zone: currentZone as Zone, points: [...currentPoints, point] })
      }
      currentZone = zone
      currentPoints = [point]
    } else {
      currentPoints.push(point)
    }
  }

  if (currentPoints.length > 0 && currentZone !== null) {
    segments.push({ zone: currentZone, points: currentPoints })
  }

  return segments
}

/** Discards samples older than the trailing window — the "~10s scrolling" behavior. */
export function windowedSamples(
  samples: ChartSample[],
  nowOffsetMs: number,
  windowMs: number,
): ChartSample[] {
  const cutoff = nowOffsetMs - windowMs
  return samples.filter((s) => s.offsetMs >= cutoff)
}
