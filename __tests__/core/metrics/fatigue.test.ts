import { computeFatigueIndex } from '../../../src/core/metrics/fatigue'

describe('computeFatigueIndex', () => {
  it('is null for fewer than 2 reps — nothing to decay across', () => {
    expect(computeFatigueIndex([])).toBeNull()
    expect(computeFatigueIndex([30])).toBeNull()
  })

  it('is 0 when there is no decay (last rep equals first)', () => {
    expect(computeFatigueIndex([30, 32, 29, 30])).toBe(0)
  })

  it('computes (first - last) / first for a decaying series', () => {
    // 20% drop from 30 to 24
    expect(computeFatigueIndex([30, 28, 26, 24])).toBeCloseTo(0.2, 6)
  })

  it('is negative when the last rep is stronger than the first (rare but valid)', () => {
    expect(computeFatigueIndex([20, 22, 25])).toBeCloseTo(-0.25, 6)
  })

  it('only first and last reps matter — middle reps do not affect the result', () => {
    const a = computeFatigueIndex([30, 15, 15, 15, 15, 24])
    const b = computeFatigueIndex([30, 24])
    expect(a).toBeCloseTo(b as number, 10)
  })

  it('returns null rather than dividing by zero when the first rep is 0', () => {
    expect(computeFatigueIndex([0, 10, 20])).toBeNull()
  })

  it('is 1.0 (full decay) when the last rep hits exactly zero', () => {
    expect(computeFatigueIndex([25, 10, 0])).toBe(1)
  })
})
