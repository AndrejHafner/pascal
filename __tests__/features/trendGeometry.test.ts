import { computeTrendScale, trendPointToXY, valueToY } from '../../src/features/chart/trendGeometry'
import type { TrendPoint, TrendDimensions } from '../../src/features/chart/trendGeometry'

const dims: TrendDimensions = { width: 300, height: 200 }

describe('computeTrendScale', () => {
  it('returns a safe default scale for no points', () => {
    const scale = computeTrendScale([])
    expect(scale.minValue).toBe(0)
    expect(scale.maxValue).toBeGreaterThan(0)
  })

  it('scales to 1.15x the max value', () => {
    const points: TrendPoint[] = [
      { timestampMs: 0, value: 10 },
      { timestampMs: 1000, value: 30 },
    ]
    const scale = computeTrendScale(points)
    expect(scale.maxValue).toBeCloseTo(30 * 1.15, 4)
  })

  it('folds a reference value into the max so it never clips', () => {
    const points: TrendPoint[] = [{ timestampMs: 0, value: 5 }]
    const scale = computeTrendScale(points, 50)
    expect(scale.maxValue).toBeCloseTo(50 * 1.15, 4)
  })

  it('minValue is always 0', () => {
    const points: TrendPoint[] = [{ timestampMs: 0, value: 100 }]
    expect(computeTrendScale(points).minValue).toBe(0)
  })

  it('handles a single point without dividing by zero', () => {
    const points: TrendPoint[] = [{ timestampMs: 5000, value: 40 }]
    const scale = computeTrendScale(points)
    expect(scale.minTimestampMs).toBe(5000)
    expect(scale.maxTimestampMs).toBe(5000)
    expect(Number.isFinite(scale.maxValue)).toBe(true)
  })

  it('never returns a zero max value even for all-zero data', () => {
    const points: TrendPoint[] = [{ timestampMs: 0, value: 0 }]
    const scale = computeTrendScale(points)
    expect(scale.maxValue).toBeGreaterThan(0)
  })
})

describe('trendPointToXY', () => {
  it('maps the earliest timestamp to x=0 and latest to x=width', () => {
    const points: TrendPoint[] = [
      { timestampMs: 0, value: 10 },
      { timestampMs: 1000, value: 20 },
    ]
    const scale = computeTrendScale(points)
    expect(trendPointToXY(points[0], scale, dims).x).toBeCloseTo(0, 6)
    expect(trendPointToXY(points[1], scale, dims).x).toBeCloseTo(300, 6)
  })

  it('maps value 0 to the bottom (y=height) and maxValue to the top (y=0)', () => {
    const points: TrendPoint[] = [{ timestampMs: 0, value: 100 }]
    const scale = computeTrendScale(points)
    expect(trendPointToXY({ timestampMs: 0, value: 0 }, scale, dims).y).toBeCloseTo(200, 6)
    expect(trendPointToXY({ timestampMs: 0, value: scale.maxValue }, scale, dims).y).toBeCloseTo(
      0,
      6,
    )
  })

  it('a single data point centers horizontally instead of dividing by zero', () => {
    const points: TrendPoint[] = [{ timestampMs: 5000, value: 40 }]
    const scale = computeTrendScale(points)
    const { x } = trendPointToXY(points[0], scale, dims)
    expect(x).toBeCloseTo(150, 6) // width / 2
    expect(Number.isFinite(x)).toBe(true)
  })
})

describe('valueToY — for drawing a fixed reference line (e.g. asymmetry threshold)', () => {
  it('maps a reference value to the correct y regardless of the data points', () => {
    const points: TrendPoint[] = [{ timestampMs: 0, value: 10 }]
    const scale = computeTrendScale(points, 20)
    const y = valueToY(20, scale, dims)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(200)
  })
})
