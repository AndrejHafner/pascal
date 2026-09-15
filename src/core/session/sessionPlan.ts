// A SessionPlan is what Session setup (docs/04) produces: an ordered list
// of steps to run in one workout. Per the "same-session max -> train" flow
// (docs/03's core loop: test -> prescribe -> train), a plan can chain a
// max-effort step's result into a later target-band step's prescription —
// "targetSourceStepIndex" points back at an earlier MaxEffortStep so its
// just-recorded max (not a stale historical one) prescribes the target.
//
// This is planning data, not execution state — src/core/protocol/machine.ts's
// SessionState is the live per-set state machine; a SessionPlan is compiled
// into a sequence of SetPlan + Band (see machine.ts) as each step starts.

import type { SetPlan } from '../protocol/machine'
import type { Band } from '../metrics/band'

export interface MaxEffortStep {
  kind: 'max_effort'
  exerciseId: string
  attempts: number
  pullDurationMs: number
  restBetweenAttemptsMs: number
  smoothingWindowMs: number
}

export interface TargetBandStep {
  kind: 'target_band'
  exerciseId: string
  /**
   * Where the target force comes from. 'latest_max' looks up the most
   * recent MaxRecord for this exercise+hand (may be from a prior session —
   * see docs/04 stale-max warning). 'session_step' prescribes off a
   * MaxEffortStep earlier in THIS plan, once that step's actual result is
   * known — the "test then train in one workout" flow.
   */
  maxSource: { kind: 'latest_max' } | { kind: 'session_step'; stepIndex: number }
  targetPercent: number
  toleranceKg: number
  workDurationMs: number
  interHandRestMs: number
  interSetRestMs: number
  setCount: number
}

export type SessionStep = MaxEffortStep | TargetBandStep

export interface SessionPlan {
  steps: SessionStep[]
}

/** A single resolved set within a step, ready to hand to the live runner. */
export interface ResolvedSet {
  stepIndex: number
  setPlan: SetPlan
  band: Band | null
  /** Only for max_effort sets — which attempt number (0-indexed) within the step. */
  attemptIndex: number | null
}

export function isMaxEffortStep(step: SessionStep): step is MaxEffortStep {
  return step.kind === 'max_effort'
}

export function isTargetBandStep(step: SessionStep): step is TargetBandStep {
  return step.kind === 'target_band'
}
