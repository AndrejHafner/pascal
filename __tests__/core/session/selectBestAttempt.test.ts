import { selectBestAttempt } from '../../../src/core/session/selectBestAttempt'
import type { AttemptResult } from '../../../src/core/session/selectBestAttempt'

describe('selectBestAttempt', () => {
  it('picks the highest smoothed peak for a single hand across attempts', () => {
    const attempts: AttemptResult[] = [
      { hand: 'left', effortId: 'a', peakForceSmoothedKg: 30, smoothingWindowMs: 1000 },
      { hand: 'left', effortId: 'b', peakForceSmoothedKg: 35, smoothingWindowMs: 1000 },
      { hand: 'left', effortId: 'c', peakForceSmoothedKg: 32, smoothingWindowMs: 1000 },
    ]
    const best = selectBestAttempt(attempts)
    expect(best.left?.effortId).toBe('b')
    expect(best.left?.forceKg).toBe(35)
  })

  it('resolves left and right independently', () => {
    const attempts: AttemptResult[] = [
      { hand: 'left', effortId: 'a', peakForceSmoothedKg: 30, smoothingWindowMs: 1000 },
      { hand: 'right', effortId: 'x', peakForceSmoothedKg: 45, smoothingWindowMs: 1000 },
      { hand: 'left', effortId: 'b', peakForceSmoothedKg: 28, smoothingWindowMs: 1000 },
      { hand: 'right', effortId: 'y', peakForceSmoothedKg: 40, smoothingWindowMs: 1000 },
    ]
    const best = selectBestAttempt(attempts)
    expect(best.left?.effortId).toBe('a')
    expect(best.right?.effortId).toBe('x')
  })

  it('a single attempt is trivially the best', () => {
    const attempts: AttemptResult[] = [
      { hand: 'left', effortId: 'only', peakForceSmoothedKg: 20, smoothingWindowMs: 1000 },
    ]
    expect(selectBestAttempt(attempts).left?.effortId).toBe('only')
  })

  it('returns an empty result for no attempts', () => {
    expect(selectBestAttempt([])).toEqual({})
  })

  it('carries the smoothing window of the winning attempt, not any other', () => {
    const attempts: AttemptResult[] = [
      { hand: 'left', effortId: 'a', peakForceSmoothedKg: 30, smoothingWindowMs: 500 },
      { hand: 'left', effortId: 'b', peakForceSmoothedKg: 40, smoothingWindowMs: 1000 },
    ]
    expect(selectBestAttempt(attempts).left?.smoothingWindowMs).toBe(1000)
  })
})
