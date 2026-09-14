// % of max -> target force, with stale/missing max handling — see
// docs/03-training-and-data-model.md "Core training loop" step 2 and
// docs/04-screens-and-ux.md "Stale max warning": "training at a percentage
// of a stale max is the main way this model silently goes wrong."

export interface MaxRecordLike {
  forceKg: number
  recordedAt: number
}

export type PrescriptionResult =
  { status: 'ok'; targetForceKg: number; isStale: boolean; maxAgeMs: number } | { status: 'no_max' }

const DEFAULT_STALE_WINDOW_MS = 6 * 7 * 24 * 60 * 60 * 1000 // 6 weeks, per docs/04

/**
 * Computes a target force from a percentage of a recorded max. Never
 * silently invents a max — 'no_max' is a real, expected outcome the caller
 * must handle (docs/04: target-band setup is blocked without a max on
 * record, since "a % of nothing is meaningless").
 */
export function prescribeTargetForce(
  max: MaxRecordLike | null,
  targetPercent: number,
  now: number = Date.now(),
  staleWindowMs: number = DEFAULT_STALE_WINDOW_MS,
): PrescriptionResult {
  if (max === null) return { status: 'no_max' }

  const maxAgeMs = now - max.recordedAt
  return {
    status: 'ok',
    targetForceKg: max.forceKg * (targetPercent / 100),
    isStale: maxAgeMs > staleWindowMs,
    maxAgeMs,
  }
}
