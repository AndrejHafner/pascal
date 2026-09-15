import {
  computeLatchedYScale,
  forceToY,
  offsetToX,
  buildTraceSegments,
  windowedSamples,
} from '../../src/features/chart/chartGeometry'
import type { Band } from '../../src/core/metrics/band'
import type { ChartDimensions } from '../../src/features/chart/chartGeometry'

const band: Band = { targetKg: 30, toleranceKg: 5 } // [25, 35]
const dims: ChartDimensions = { width: 300, height: 200 }

describe('computeLatchedYScale', () => {
  it('scales to max(peak, band ceiling) * 1.15', () => {
    const scale = computeLatchedYScale(20, band, 0)
    // band ceiling (35) > peak (20), so scale follows the ceiling
    expect(scale.maxKg).toBeCloseTo(35 * 1.15, 4)
  })

  it('scales to the peak when it exceeds the band ceiling', () => {
    const scale = computeLatchedYScale(50, band, 0)
    expect(scale.maxKg).toBeCloseTo(50 * 1.15, 4)
  })

  it('never rescales downward — respects a higher previous max', () => {
    const scale = computeLatchedYScale(10, band, 100)
    expect(scale.maxKg).toBe(100)
  })

  it('grows when the natural max exceeds the previous latched max', () => {
    const scale = computeLatchedYScale(200, band, 50)
    expect(scale.maxKg).toBeCloseTo(200 * 1.15, 4)
  })

  it('works with no band (e.g. a max-effort test with no target)', () => {
    const scale = computeLatchedYScale(40, null, 0)
    expect(scale.maxKg).toBeCloseTo(40 * 1.15, 4)
  })

  it('minKg is always 0', () => {
    expect(computeLatchedYScale(40, band, 0).minKg).toBe(0)
  })
})

describe('forceToY', () => {
  const scale = { minKg: 0, maxKg: 40 }

  it('maps 0 force to the bottom of the chart (height)', () => {
    expect(forceToY(0, scale, dims)).toBe(200)
  })

  it('maps maxKg to the top of the chart (0)', () => {
    expect(forceToY(40, scale, dims)).toBeCloseTo(0, 6)
  })

  it('maps the midpoint force to the vertical midpoint', () => {
    expect(forceToY(20, scale, dims)).toBeCloseTo(100, 6)
  })

  it('does not divide by zero when maxKg equals minKg', () => {
    expect(forceToY(10, { minKg: 5, maxKg: 5 }, dims)).toBe(dims.height)
  })
})

describe('offsetToX', () => {
  it('maps the window start to x=0', () => {
    expect(offsetToX(1000, 1000, 10_000, dims)).toBe(0)
  })

  it('maps the window end to x=width', () => {
    expect(offsetToX(11_000, 1000, 10_000, dims)).toBeCloseTo(300, 6)
  })

  it('maps the window midpoint to the horizontal midpoint', () => {
    expect(offsetToX(6000, 1000, 10_000, dims)).toBeCloseTo(150, 6)
  })
})

describe('windowedSamples', () => {
  it('keeps only samples within the trailing window', () => {
    const samples = [
      { offsetMs: 0, forceKg: 1 },
      { offsetMs: 5000, forceKg: 2 },
      { offsetMs: 9000, forceKg: 3 },
      { offsetMs: 10_000, forceKg: 4 },
    ]
    const result = windowedSamples(samples, 10_000, 5000) // window: [5000, 10000]
    expect(result.map((s) => s.forceKg)).toEqual([2, 3, 4])
  })

  it('returns everything when the window covers the whole history', () => {
    const samples = [
      { offsetMs: 0, forceKg: 1 },
      { offsetMs: 100, forceKg: 2 },
    ]
    expect(windowedSamples(samples, 100, 10_000)).toHaveLength(2)
  })
})

describe('buildTraceSegments', () => {
  const scale = { minKg: 0, maxKg: 40 }

  it('returns one segment for a curve that stays in a single zone', () => {
    const samples = [
      { offsetMs: 0, forceKg: 30 },
      { offsetMs: 100, forceKg: 31 },
      { offsetMs: 200, forceKg: 29 },
    ]
    const segments = buildTraceSegments(samples, band, 0, 10_000, scale, dims)
    expect(segments).toHaveLength(1)
    expect(segments[0].zone).toBe('in')
    expect(segments[0].points).toHaveLength(3)
  })

  it('splits into multiple segments at zone transitions', () => {
    const samples = [
      { offsetMs: 0, forceKg: 10 }, // below
      { offsetMs: 100, forceKg: 30 }, // in
      { offsetMs: 200, forceKg: 50 }, // above
    ]
    const segments = buildTraceSegments(samples, band, 0, 10_000, scale, dims)
    expect(segments.map((s) => s.zone)).toEqual(['below', 'in', 'above'])
  })

  it('each transition point is duplicated across the two adjoining segments (no visual gap)', () => {
    const samples = [
      { offsetMs: 0, forceKg: 10 },
      { offsetMs: 100, forceKg: 30 },
    ]
    const segments = buildTraceSegments(samples, band, 0, 10_000, scale, dims)
    expect(segments).toHaveLength(2)
    // The last point of segment 0 and the first point of segment 1 should
    // be the same coordinate (the transition sample itself).
    const lastOfFirst = segments[0].points[segments[0].points.length - 1]
    const firstOfSecond = segments[1].points[0]
    expect(lastOfFirst).toEqual(firstOfSecond)
  })

  it('returns an empty array for no samples', () => {
    expect(buildTraceSegments([], band, 0, 10_000, scale, dims)).toEqual([])
  })

  it('a single sample produces one segment with one point', () => {
    const segments = buildTraceSegments(
      [{ offsetMs: 0, forceKg: 30 }],
      band,
      0,
      10_000,
      scale,
      dims,
    )
    expect(segments).toHaveLength(1)
    expect(segments[0].points).toHaveLength(1)
  })
})
