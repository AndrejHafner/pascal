// Impulse (integral of force over time) — the literature-standard "true"
// work measure, per docs/03-training-and-data-model.md: weights *how hard*
// you pulled, not merely whether you were inside the band. Companion to
// TUT, not a replacement — TUT is prescriptive, impulse is descriptive.

import type { Sample } from './rollingPeak'

/** Trapezoidal integration of force*kg over time*ms, returned in kg*s. */
export function computeImpulse(samples: Sample[]): number {
  if (samples.length < 2) return 0

  let areaKgMs = 0
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].offsetMs - samples[i - 1].offsetMs
    if (dt <= 0) continue
    areaKgMs += ((samples[i - 1].forceKg + samples[i].forceKg) / 2) * dt
  }

  return areaKgMs / 1000
}

/** Incremental counterpart — add the contribution of one new interval. */
export function accumulateImpulse(
  currentKgS: number,
  previousSample: Sample | null,
  currentSample: Sample,
): number {
  if (previousSample === null) return currentKgS
  const dt = currentSample.offsetMs - previousSample.offsetMs
  if (dt <= 0) return currentKgS
  const areaKgMs = ((previousSample.forceKg + currentSample.forceKg) / 2) * dt
  return currentKgS + areaKgMs / 1000
}
