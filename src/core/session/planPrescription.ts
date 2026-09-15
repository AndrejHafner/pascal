// Resolves a TargetBandStep's maxSource into an actual target force,
// bridging docs/03's "same-session max -> train" flow: a step can
// prescribe off a MaxRecord already in the database (latest_max) or off
// the best attempt recorded earlier in the SAME session plan
// (session_step) before that attempt's MaxRecord even exists yet.

import { prescribeTargetForce } from '../protocol/prescription'
import type { PrescriptionResult, MaxRecordLike } from '../protocol/prescription'
import type { TargetBandStep } from './sessionPlan'
import type { Hand } from '../types'

/** The best smoothed-peak result recorded so far for one step's attempts, per hand. */
export interface StepResult {
  stepIndex: number
  bestByHand: Partial<Record<Hand, MaxRecordLike>>
}

export function resolveTargetBandSource(
  step: TargetBandStep,
  hand: Hand,
  latestMaxFromDb: MaxRecordLike | null,
  sessionStepResults: StepResult[],
  now: number = Date.now(),
): PrescriptionResult {
  const source = step.maxSource

  if (source.kind === 'latest_max') {
    return prescribeTargetForce(latestMaxFromDb, step.targetPercent, now)
  }

  const sourceStep = sessionStepResults.find((r) => r.stepIndex === source.stepIndex)
  const sourceMax = sourceStep?.bestByHand[hand] ?? null
  // A same-session max is, by definition, freshly recorded — never stale.
  return prescribeTargetForce(sourceMax, step.targetPercent, now, Number.POSITIVE_INFINITY)
}
