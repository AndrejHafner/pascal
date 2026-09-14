import { computeRollingPeak } from '../../../src/core/metrics/rollingPeak'
import type { Sample } from '../../../src/core/metrics/rollingPeak'

function evenSamples(values: number[], intervalMs = 16): Sample[] {
  return values.map((forceKg, i) => ({ offsetMs: i * intervalMs, forceKg }))
}

describe('computeRollingPeak', () => {
  it('returns 0 for an empty sample set', () => {
    const result = computeRollingPeak([])
    expect(result.smoothedPeakKg).toBe(0)
    expect(result.instantPeakKg).toBe(0)
  })

  it('a single sample: instant and smoothed peak both equal that sample', () => {
    const result = computeRollingPeak([{ offsetMs: 0, forceKg: 42 }])
    expect(result.instantPeakKg).toBe(42)
    expect(result.smoothedPeakKg).toBe(42)
  })

  it('a perfectly flat curve: smoothed peak equals the flat value', () => {
    const samples = evenSamples(Array(100).fill(30))
    const result = computeRollingPeak(samples, 1000)
    expect(result.smoothedPeakKg).toBeCloseTo(30, 6)
    expect(result.instantPeakKg).toBe(30)
  })

  it('instant peak captures a single-sample spike that the smoothed peak dampens', () => {
    // 3s at 30kg, one sample spikes to 100kg, then back to 30kg for another 3s.
    const values = [...Array(188).fill(30), 100, ...Array(188).fill(30)]
    const samples = evenSamples(values)
    const result = computeRollingPeak(samples, 1000)

    expect(result.instantPeakKg).toBe(100)
    // A single 16ms spike averaged into a 1000ms window contributes at most
    // ~16/1000 of the window's weight — nowhere near 100.
    expect(result.smoothedPeakKg).toBeLessThan(32)
    expect(result.smoothedPeakKg).toBeGreaterThan(30)
  })

  it('the smoothed peak occurs at the plateau, tracking a known ramp-plateau-ramp shape', () => {
    // ramp 0->40 over 1s, hold 40 for 2s, ramp down 40->0 over 1s
    const values: number[] = []
    for (let ms = 0; ms <= 1000; ms += 16) values.push((40 * ms) / 1000)
    for (let ms = 16; ms <= 2000; ms += 16) values.push(40)
    for (let ms = 16; ms <= 1000; ms += 16) values.push(40 - (40 * ms) / 1000)
    const samples = evenSamples(values)

    const result = computeRollingPeak(samples, 1000)
    // Once the window is fully inside the flat plateau, the windowed mean
    // should be very close to 40.
    expect(result.smoothedPeakKg).toBeCloseTo(40, 0)
    expect(result.smoothedPeakKg).toBeLessThanOrEqual(result.instantPeakKg + 1e-6)
  })

  it('stores the window size used', () => {
    const samples = evenSamples([10, 20, 30])
    expect(computeRollingPeak(samples, 500).windowMs).toBe(500)
    expect(computeRollingPeak(samples).windowMs).toBe(1000) // default
  })

  it('a 3s window vs a 1s window on the same 5s pull gives different (lower) 3s peak', () => {
    // Ramp 0->50 over 5s (200ms steps for a manageable sample count) — a 3s
    // window necessarily includes more ramp-up than a 1s window near the
    // peak, so it should read equal or lower.
    const values: number[] = []
    for (let ms = 0; ms <= 5000; ms += 100) values.push((50 * ms) / 5000)
    const samples = evenSamples(values, 100)

    const window1s = computeRollingPeak(samples, 1000).smoothedPeakKg
    const window3s = computeRollingPeak(samples, 3000).smoothedPeakKg

    expect(window3s).toBeLessThanOrEqual(window1s + 1e-6)
  })

  it('handles unevenly spaced samples without crashing or producing NaN', () => {
    const samples: Sample[] = [
      { offsetMs: 0, forceKg: 10 },
      { offsetMs: 5, forceKg: 12 },
      { offsetMs: 800, forceKg: 25 },
      { offsetMs: 820, forceKg: 26 },
      { offsetMs: 2000, forceKg: 5 },
    ]
    const result = computeRollingPeak(samples, 1000)
    expect(Number.isFinite(result.smoothedPeakKg)).toBe(true)
    expect(Number.isFinite(result.instantPeakKg)).toBe(true)
  })
})
