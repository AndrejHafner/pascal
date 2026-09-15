// Max rule: single best attempt — see docs/03-training-and-data-model.md
// "Defining 'max'": "the best smoothed peak across the attempts for that
// hand becomes the max." Picks per hand independently, since attempts for
// left and right are separate Efforts.

import type { Hand } from '../types'

export interface AttemptResult {
  hand: Hand
  effortId: string
  peakForceSmoothedKg: number
  smoothingWindowMs: number
}

export interface BestAttempt {
  effortId: string
  forceKg: number
  smoothingWindowMs: number
}

/** Picks the highest peakForceSmoothedKg per hand across a set of attempts. */
export function selectBestAttempt(attempts: AttemptResult[]): Partial<Record<Hand, BestAttempt>> {
  const best: Partial<Record<Hand, BestAttempt>> = {}

  for (const attempt of attempts) {
    const current = best[attempt.hand]
    if (!current || attempt.peakForceSmoothedKg > current.forceKg) {
      best[attempt.hand] = {
        effortId: attempt.effortId,
        forceKg: attempt.peakForceSmoothedKg,
        smoothingWindowMs: attempt.smoothingWindowMs,
      }
    }
  }

  return best
}
