import { computeTut, accumulateTut, emptyTutAccumulator } from '../../../src/core/metrics/tut'
import type { Sample } from '../../../src/core/metrics/rollingPeak'
import type { Band } from '../../../src/core/metrics/tut'

function seq(points: [number, number][]): Sample[] {
  return points.map(([offsetMs, forceKg]) => ({ offsetMs, forceKg }))
}

const band: Band = { targetKg: 30, toleranceKg: 5 } // band = [25, 35]

describe('computeTut — band boundaries', () => {
  it('a value exactly at the lower bound counts as in-band, not below', () => {
    const samples = seq([
      [0, 25],
      [1000, 25],
    ])
    const result = computeTut(samples, band)
    expect(result.timeInBandMs).toBe(1000)
    expect(result.timeBelowBandMs).toBe(0)
  })

  it('a value exactly at the upper bound counts as in-band, not above', () => {
    const samples = seq([
      [0, 35],
      [1000, 35],
    ])
    const result = computeTut(samples, band)
    expect(result.timeInBandMs).toBe(1000)
    expect(result.timeAboveBandMs).toBe(0)
  })

  it('a value just below the lower bound counts as below', () => {
    const samples = seq([
      [0, 24.99],
      [1000, 24.99],
    ])
    const result = computeTut(samples, band)
    expect(result.timeBelowBandMs).toBe(1000)
  })

  it('a value just above the upper bound counts as above', () => {
    const samples = seq([
      [0, 35.01],
      [1000, 35.01],
    ])
    const result = computeTut(samples, band)
    expect(result.timeAboveBandMs).toBe(1000)
  })
})

describe('computeTut — TUT = in + above, never includes below (docs/03)', () => {
  it('a set held entirely in-band: TUT equals total duration', () => {
    const samples = seq([
      [0, 30],
      [5000, 30],
    ])
    const result = computeTut(samples, band)
    expect(result.timeUnderTensionMs).toBe(5000)
    expect(result.timeInBandMs).toBe(5000)
  })

  it('a set held entirely above-band still counts as full TUT — overshoot is not penalized', () => {
    const samples = seq([
      [0, 50],
      [5000, 50],
    ])
    const result = computeTut(samples, band)
    expect(result.timeUnderTensionMs).toBe(5000)
    expect(result.timeAboveBandMs).toBe(5000)
    expect(result.timeInBandMs).toBe(0)
  })

  it('a set held entirely below-band contributes zero TUT', () => {
    const samples = seq([
      [0, 10],
      [5000, 10],
    ])
    const result = computeTut(samples, band)
    expect(result.timeUnderTensionMs).toBe(0)
    expect(result.timeBelowBandMs).toBe(5000)
  })

  it('mixed zones sum to the total duration across all three buckets', () => {
    const samples = seq([
      [0, 30], // in
      [1000, 40], // above
      [2000, 10], // below
      [3000, 30], // in
    ])
    const result = computeTut(samples, band)
    const total = result.timeInBandMs + result.timeAboveBandMs + result.timeBelowBandMs
    expect(total).toBe(3000)
    expect(result.timeUnderTensionMs).toBe(result.timeInBandMs + result.timeAboveBandMs)
  })
})

describe('computeTut — timeToTargetMs', () => {
  it('is 0 when the first sample is already in-band', () => {
    const samples = seq([
      [0, 30],
      [1000, 30],
    ])
    expect(computeTut(samples, band).timeToTargetMs).toBe(0)
  })

  it('is 0 when the first sample is already above-band', () => {
    const samples = seq([
      [0, 50],
      [1000, 50],
    ])
    expect(computeTut(samples, band).timeToTargetMs).toBe(0)
  })

  it('measures the delay until first crossing into band or above', () => {
    const samples = seq([
      [0, 10],
      [500, 15],
      [1200, 28], // crosses into band here
      [2000, 30],
    ])
    expect(computeTut(samples, band).timeToTargetMs).toBe(1200)
  })

  it('is null when the band is never reached', () => {
    const samples = seq([
      [0, 5],
      [1000, 10],
      [2000, 15],
    ])
    expect(computeTut(samples, band).timeToTargetMs).toBeNull()
  })
})

describe('computeTut — edge cases', () => {
  it('empty samples: all zero, timeToTargetMs null', () => {
    const result = computeTut([], band)
    expect(result.timeUnderTensionMs).toBe(0)
    expect(result.timeToTargetMs).toBeNull()
  })

  it('a single sample contributes no duration to any bucket (no interval to attribute)', () => {
    const result = computeTut(seq([[0, 30]]), band)
    expect(result.timeInBandMs).toBe(0)
    expect(result.timeAboveBandMs).toBe(0)
    expect(result.timeBelowBandMs).toBe(0)
    // but timeToTargetMs is still meaningful — the single sample IS in band
    expect(result.timeToTargetMs).toBe(0)
  })

  it('ignores a non-positive interval (duplicate or out-of-order offsetMs) without crashing', () => {
    const samples = seq([
      [0, 30],
      [0, 30], // duplicate offset, dt = 0
      [1000, 30],
    ])
    const result = computeTut(samples, band)
    expect(result.timeInBandMs).toBe(1000)
  })
})

describe('accumulateTut agrees with computeTut on the same samples (docs/07 incremental vs final)', () => {
  it('matches across a mixed-zone sequence', () => {
    const samples = seq([
      [0, 10],
      [500, 28],
      [1500, 32],
      [2500, 40],
      [3500, 20],
      [4500, 30],
    ])

    const final = computeTut(samples, band)

    let acc = emptyTutAccumulator()
    for (let i = 0; i < samples.length; i++) {
      const prev = i === 0 ? null : samples[i - 1]
      acc = accumulateTut(acc, prev, samples[i], band, samples[0].offsetMs)
    }

    expect(acc.timeInBandMs).toBe(final.timeInBandMs)
    expect(acc.timeAboveBandMs).toBe(final.timeAboveBandMs)
    expect(acc.timeBelowBandMs).toBe(final.timeBelowBandMs)
    expect(acc.timeUnderTensionMs).toBe(final.timeUnderTensionMs)
    expect(acc.timeToTargetMs).toBe(final.timeToTargetMs)
  })

  it('matches when the effort never reaches the band', () => {
    const samples = seq([
      [0, 5],
      [1000, 8],
      [2000, 12],
    ])
    const final = computeTut(samples, band)

    let acc = emptyTutAccumulator()
    for (let i = 0; i < samples.length; i++) {
      const prev = i === 0 ? null : samples[i - 1]
      acc = accumulateTut(acc, prev, samples[i], band, samples[0].offsetMs)
    }

    expect(acc.timeToTargetMs).toBeNull()
    expect(final.timeToTargetMs).toBeNull()
    expect(acc.timeUnderTensionMs).toBe(0)
  })

  it('matches when the effort starts already in-band', () => {
    const samples = seq([
      [0, 30],
      [1000, 32],
      [2000, 29],
    ])
    const final = computeTut(samples, band)

    let acc = emptyTutAccumulator()
    for (let i = 0; i < samples.length; i++) {
      const prev = i === 0 ? null : samples[i - 1]
      acc = accumulateTut(acc, prev, samples[i], band, samples[0].offsetMs)
    }

    expect(acc.timeToTargetMs).toBe(0)
    expect(final.timeToTargetMs).toBe(0)
  })

  it('matches when the effort start offset is nonzero', () => {
    // Simulates an effort whose first sample offsetMs isn't 0 for some reason.
    const samples = seq([
      [500, 10],
      [1500, 28],
      [2500, 30],
    ])
    const final = computeTut(samples, band)

    let acc = emptyTutAccumulator()
    for (let i = 0; i < samples.length; i++) {
      const prev = i === 0 ? null : samples[i - 1]
      acc = accumulateTut(acc, prev, samples[i], band, samples[0].offsetMs)
    }

    expect(acc.timeToTargetMs).toBe(final.timeToTargetMs)
    expect(acc.timeToTargetMs).toBe(1000) // 1500 - 500
  })
})
