import { toPercentBodyweight } from '../../../src/core/progress/normalization'

describe('toPercentBodyweight', () => {
  it('computes force as a percentage of bodyweight at test time', () => {
    expect(toPercentBodyweight(30, 75)).toBeCloseTo(40, 6)
  })

  it('a 1:1 force-to-bodyweight ratio is 100%', () => {
    expect(toPercentBodyweight(80, 80)).toBeCloseTo(100, 6)
  })

  it('does not divide by zero for a zero or negative bodyweight', () => {
    expect(toPercentBodyweight(30, 0)).toBe(0)
    expect(toPercentBodyweight(30, -5)).toBe(0)
  })
})
