import { resolveTargetBandSource } from '../../../src/core/session/planPrescription'
import type { TargetBandStep } from '../../../src/core/session/sessionPlan'
import type { StepResult } from '../../../src/core/session/planPrescription'

const baseStep: TargetBandStep = {
  kind: 'target_band',
  exerciseId: 'ex-1',
  maxSource: { kind: 'latest_max' },
  targetPercent: 80,
  toleranceKg: 2,
  workDurationMs: 10_000,
  interHandRestMs: 5000,
  interSetRestMs: 180_000,
  setCount: 5,
}

describe('resolveTargetBandSource — latest_max', () => {
  it('prescribes off the DB max when maxSource is latest_max', () => {
    const now = Date.now()
    const result = resolveTargetBandSource(
      baseStep,
      'left',
      { forceKg: 40, recordedAt: now },
      [],
      now,
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.targetForceKg).toBeCloseTo(32, 6)
  })

  it('returns no_max when there is no DB max and no session-step fallback', () => {
    const result = resolveTargetBandSource(baseStep, 'left', null, [])
    expect(result.status).toBe('no_max')
  })

  it('applies the normal 6-week staleness window to a DB max', () => {
    const now = Date.now()
    const eightWeeksAgo = now - 8 * 7 * 24 * 60 * 60 * 1000
    const result = resolveTargetBandSource(
      baseStep,
      'left',
      { forceKg: 40, recordedAt: eightWeeksAgo },
      [],
      now,
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.isStale).toBe(true)
  })
})

describe('resolveTargetBandSource — session_step', () => {
  const stepBoundToSession: TargetBandStep = {
    ...baseStep,
    maxSource: { kind: 'session_step', stepIndex: 0 },
  }

  it('prescribes off the same-session max, ignoring the DB max entirely', () => {
    const now = Date.now()
    const sessionResults: StepResult[] = [
      { stepIndex: 0, bestByHand: { left: { forceKg: 50, recordedAt: now } } },
    ]
    const result = resolveTargetBandSource(
      stepBoundToSession,
      'left',
      { forceKg: 999, recordedAt: now }, // DB max present but must be ignored
      sessionResults,
      now,
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.targetForceKg).toBeCloseTo(40, 6) // 80% of 50, not of 999
  })

  it('a same-session max is never flagged stale, regardless of age', () => {
    const now = Date.now()
    const longAgo = now - 365 * 24 * 60 * 60 * 1000
    const sessionResults: StepResult[] = [
      { stepIndex: 0, bestByHand: { left: { forceKg: 50, recordedAt: longAgo } } },
    ]
    const result = resolveTargetBandSource(stepBoundToSession, 'left', null, sessionResults, now)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.isStale).toBe(false)
  })

  it('returns no_max when the referenced step has no result for this hand yet', () => {
    const sessionResults: StepResult[] = [{ stepIndex: 0, bestByHand: {} }]
    const result = resolveTargetBandSource(stepBoundToSession, 'left', null, sessionResults)
    expect(result.status).toBe('no_max')
  })

  it('returns no_max when the referenced step index does not exist in the results', () => {
    const result = resolveTargetBandSource(stepBoundToSession, 'left', null, [])
    expect(result.status).toBe('no_max')
  })

  it('resolves each hand independently from the referenced step', () => {
    const now = Date.now()
    const sessionResults: StepResult[] = [
      {
        stepIndex: 0,
        bestByHand: {
          left: { forceKg: 40, recordedAt: now },
          right: { forceKg: 50, recordedAt: now },
        },
      },
    ]
    const left = resolveTargetBandSource(stepBoundToSession, 'left', null, sessionResults, now)
    const right = resolveTargetBandSource(stepBoundToSession, 'right', null, sessionResults, now)
    expect(left.status).toBe('ok')
    expect(right.status).toBe('ok')
    if (left.status !== 'ok' || right.status !== 'ok') throw new Error('unreachable')
    expect(left.targetForceKg).toBeCloseTo(32, 6)
    expect(right.targetForceKg).toBeCloseTo(40, 6)
  })
})
