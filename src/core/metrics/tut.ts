// Time-under-tension bucketing — see docs/03-training-and-data-model.md
// "Target-band training set". Band: [target - tolerance, target + tolerance].
// TUT accumulates whenever force >= target - tolerance (in-band OR
// above-band); only falling below the lower bound stops the clock.
// Honesty note (docs/03): the tolerance-band concept itself has no
// literature backing — it's a Pascal design decision.

import type { Sample } from './rollingPeak'

export interface Band {
  targetKg: number
  toleranceKg: number
}

export interface TutResult {
  /** in-band + above-band. The prescriptive number. */
  timeUnderTensionMs: number
  /** Descriptive breakdown — in + above + below == effort duration. */
  timeInBandMs: number
  timeAboveBandMs: number
  timeBelowBandMs: number
  /** ms from the first sample to the first sample at or above the lower bound. null if never reached. */
  timeToTargetMs: number | null
}

type Zone = 'below' | 'in' | 'above'

function zoneOf(forceKg: number, band: Band): Zone {
  const lower = band.targetKg - band.toleranceKg
  const upper = band.targetKg + band.toleranceKg
  if (forceKg < lower) return 'below'
  if (forceKg > upper) return 'above'
  return 'in'
}

/**
 * Buckets time between consecutive samples by which zone the *leading*
 * sample of each interval falls in — i.e. the zone at the start of an
 * interval determines which bucket that interval's duration is credited
 * to. This matches how the live app must behave: the clock's state during
 * [sample i, sample i+1) is whatever it was set to at sample i, since
 * sample i+1's zone isn't known until it arrives.
 */
export function computeTut(samples: Sample[], band: Band): TutResult {
  const result: TutResult = {
    timeUnderTensionMs: 0,
    timeInBandMs: 0,
    timeAboveBandMs: 0,
    timeBelowBandMs: 0,
    timeToTargetMs: null,
  }

  if (samples.length === 0) return result

  const firstZone = zoneOf(samples[0].forceKg, band)
  if (firstZone !== 'below') result.timeToTargetMs = 0

  for (let i = 0; i < samples.length - 1; i++) {
    const zone = zoneOf(samples[i].forceKg, band)
    const dt = samples[i + 1].offsetMs - samples[i].offsetMs
    if (dt <= 0) continue

    creditZone(result, zone, dt)

    if (result.timeToTargetMs === null && zone !== 'below') {
      result.timeToTargetMs = samples[i].offsetMs - samples[0].offsetMs
    }
  }

  // The last sample has no following interval to attribute duration to
  // (there's no "next" timestamp) — per docs/03 this is a measure of
  // elapsed *intervals*, so a trailing single sample contributes nothing,
  // consistent with "never fabricate data" (docs/06).
  if (
    result.timeToTargetMs === null &&
    zoneOf(samples[samples.length - 1].forceKg, band) !== 'below'
  ) {
    result.timeToTargetMs = samples[samples.length - 1].offsetMs - samples[0].offsetMs
  }

  return result
}

function creditZone(result: TutResult, zone: Zone, dt: number): void {
  switch (zone) {
    case 'in':
      result.timeInBandMs += dt
      result.timeUnderTensionMs += dt
      break
    case 'above':
      result.timeAboveBandMs += dt
      result.timeUnderTensionMs += dt
      break
    case 'below':
      result.timeBelowBandMs += dt
      break
  }
}

/**
 * Incremental counterpart — called once per new sample as it arrives (the
 * drain loop), given the *previous* sample so an interval can be credited.
 * Mutates and returns the accumulator so the caller can hold it across
 * calls without reallocating. Must agree with computeTut over the same
 * samples — see docs/07-architecture.md "Metrics: incremental, then final".
 *
 * `startOffsetMs` is the effort's first sample offset, so timeToTargetMs is
 * always relative to effort start even if the first sample's offsetMs
 * isn't exactly 0 (it should be, per docs/03, but this doesn't assume it).
 */
export function accumulateTut(
  acc: TutResult,
  previousSample: Sample | null,
  currentSample: Sample,
  band: Band,
  startOffsetMs: number,
): TutResult {
  if (previousSample === null) {
    if (zoneOf(currentSample.forceKg, band) !== 'below') acc.timeToTargetMs = 0
    return acc
  }

  const dt = currentSample.offsetMs - previousSample.offsetMs
  if (dt > 0) {
    const zone = zoneOf(previousSample.forceKg, band)
    creditZone(acc, zone, dt)
    if (acc.timeToTargetMs === null && zone !== 'below') {
      acc.timeToTargetMs = previousSample.offsetMs - startOffsetMs
    }
  }

  return acc
}

export function emptyTutAccumulator(): TutResult {
  return {
    timeUnderTensionMs: 0,
    timeInBandMs: 0,
    timeAboveBandMs: 0,
    timeBelowBandMs: 0,
    timeToTargetMs: null,
  }
}
