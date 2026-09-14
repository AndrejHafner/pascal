import { prescribeTargetForce } from '../../../src/core/protocol/prescription'

const DAY_MS = 24 * 60 * 60 * 1000

describe('prescribeTargetForce', () => {
  it('returns no_max when no max record exists — never invents a target', () => {
    const result = prescribeTargetForce(null, 80)
    expect(result.status).toBe('no_max')
  })

  it('computes targetForceKg as a simple percentage of the max', () => {
    const result = prescribeTargetForce({ forceKg: 40, recordedAt: Date.now() }, 80)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.targetForceKg).toBeCloseTo(32, 6)
  })

  it('is not stale immediately after the max was recorded', () => {
    const now = Date.now()
    const result = prescribeTargetForce({ forceKg: 40, recordedAt: now }, 80, now)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.isStale).toBe(false)
  })

  it('flags a max older than 6 weeks as stale, per docs/04 default', () => {
    const now = Date.now()
    const sevenWeeksAgo = now - 7 * 7 * DAY_MS
    const result = prescribeTargetForce({ forceKg: 40, recordedAt: sevenWeeksAgo }, 80, now)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.isStale).toBe(true)
  })

  it('does not flag a max just under the 6-week window as stale', () => {
    const now = Date.now()
    const fiveWeeksAgo = now - 5 * 7 * DAY_MS
    const result = prescribeTargetForce({ forceKg: 40, recordedAt: fiveWeeksAgo }, 80, now)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.isStale).toBe(false)
  })

  it('respects a custom stale window', () => {
    const now = Date.now()
    const twoDaysAgo = now - 2 * DAY_MS
    const result = prescribeTargetForce({ forceKg: 40, recordedAt: twoDaysAgo }, 80, now, DAY_MS)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.isStale).toBe(true)
  })

  it('reports the max age in ms', () => {
    const now = Date.now()
    const threeDaysAgo = now - 3 * DAY_MS
    const result = prescribeTargetForce({ forceKg: 40, recordedAt: threeDaysAgo }, 80, now)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.maxAgeMs).toBe(3 * DAY_MS)
  })

  it('handles a 100%+ target percent (e.g. above-max prescriptions are representable)', () => {
    const result = prescribeTargetForce({ forceKg: 40, recordedAt: Date.now() }, 110)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.targetForceKg).toBeCloseTo(44, 6)
  })
})
