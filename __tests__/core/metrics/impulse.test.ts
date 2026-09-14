import { computeImpulse, accumulateImpulse } from '../../../src/core/metrics/impulse'
import type { Sample } from '../../../src/core/metrics/rollingPeak'

describe('computeImpulse', () => {
  it('is 0 for fewer than 2 samples', () => {
    expect(computeImpulse([])).toBe(0)
    expect(computeImpulse([{ offsetMs: 0, forceKg: 30 }])).toBe(0)
  })

  it('a constant force over a known duration: impulse = force * time', () => {
    // 20kg held for exactly 5s -> 100 kg*s
    const samples: Sample[] = [
      { offsetMs: 0, forceKg: 20 },
      { offsetMs: 5000, forceKg: 20 },
    ]
    expect(computeImpulse(samples)).toBeCloseTo(100, 6)
  })

  it('a linear ramp from 0 to 40kg over 2s: impulse = area of the triangle', () => {
    // area = 0.5 * base * height = 0.5 * 2s * 40kg = 40 kg*s
    const samples: Sample[] = [
      { offsetMs: 0, forceKg: 0 },
      { offsetMs: 2000, forceKg: 40 },
    ]
    expect(computeImpulse(samples)).toBeCloseTo(40, 6)
  })

  it('sums correctly across multiple unevenly spaced segments', () => {
    const samples: Sample[] = [
      { offsetMs: 0, forceKg: 10 }, // seg1: trapezoid(10,20)*1s = 15
      { offsetMs: 1000, forceKg: 20 },
      { offsetMs: 1500, forceKg: 20 }, // seg2: trapezoid(20,20)*0.5s = 10
    ]
    expect(computeImpulse(samples)).toBeCloseTo(25, 6)
  })

  it('ignores a non-positive interval without corrupting the total', () => {
    const samples: Sample[] = [
      { offsetMs: 0, forceKg: 10 },
      { offsetMs: 0, forceKg: 10 }, // duplicate offset
      { offsetMs: 1000, forceKg: 10 },
    ]
    expect(computeImpulse(samples)).toBeCloseTo(10, 6)
  })
})

describe('accumulateImpulse agrees with computeImpulse', () => {
  it('matches over a realistic mixed curve', () => {
    const samples: Sample[] = [
      { offsetMs: 0, forceKg: 5 },
      { offsetMs: 200, forceKg: 25 },
      { offsetMs: 1200, forceKg: 30 },
      { offsetMs: 2200, forceKg: 28 },
      { offsetMs: 3200, forceKg: 0 },
    ]

    const final = computeImpulse(samples)

    let acc = 0
    for (let i = 0; i < samples.length; i++) {
      const prev = i === 0 ? null : samples[i - 1]
      acc = accumulateImpulse(acc, prev, samples[i])
    }

    expect(acc).toBeCloseTo(final, 6)
  })
})
