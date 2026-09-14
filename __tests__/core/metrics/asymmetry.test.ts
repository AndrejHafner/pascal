import { computeAsymmetry, DEFAULT_ASYMMETRY_THRESHOLD } from '../../../src/core/metrics/asymmetry'

describe('computeAsymmetry', () => {
  it('reports zero asymmetry when both hands are equal', () => {
    const result = computeAsymmetry(30, 30)
    expect(result.absoluteDiffKg).toBe(0)
    expect(result.percentDiff).toBe(0)
    expect(result.strongerHand).toBe('equal')
    expect(result.exceedsThreshold).toBe(false)
  })

  it('identifies the stronger hand correctly', () => {
    expect(computeAsymmetry(35, 30).strongerHand).toBe('left')
    expect(computeAsymmetry(30, 35).strongerHand).toBe('right')
  })

  it('computes percent difference relative to the stronger hand', () => {
    // left 40, right 36 -> diff 4, relative to stronger (40) = 10%
    const result = computeAsymmetry(40, 36)
    expect(result.absoluteDiffKg).toBe(4)
    expect(result.percentDiff).toBeCloseTo(0.1, 6)
  })

  it('default threshold is 5% per docs/03 (the only climbing-adjacent sourced figure)', () => {
    expect(DEFAULT_ASYMMETRY_THRESHOLD).toBe(0.05)
  })

  it('flags exceedsThreshold only when percentDiff is strictly greater than the threshold', () => {
    // exactly at threshold: not flagged
    const atThreshold = computeAsymmetry(100, 95) // 5% diff
    expect(atThreshold.percentDiff).toBeCloseTo(0.05, 6)
    expect(atThreshold.exceedsThreshold).toBe(false)

    const overThreshold = computeAsymmetry(100, 94) // 6% diff
    expect(overThreshold.exceedsThreshold).toBe(true)
  })

  it('respects a custom threshold', () => {
    const result = computeAsymmetry(100, 90, 0.2) // 10% diff, 20% threshold
    expect(result.exceedsThreshold).toBe(false)
  })

  it('handles both hands at zero without dividing by zero', () => {
    const result = computeAsymmetry(0, 0)
    expect(result.percentDiff).toBe(0)
    expect(Number.isFinite(result.percentDiff)).toBe(true)
  })
})
