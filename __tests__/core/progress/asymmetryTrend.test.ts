import { pairForAsymmetryTrend } from '../../../src/core/progress/asymmetryTrend'

const HOUR_MS = 60 * 60 * 1000

describe('pairForAsymmetryTrend', () => {
  it('returns nothing when either hand has no records', () => {
    expect(pairForAsymmetryTrend([], [{ forceKg: 30, recordedAt: 0 }])).toEqual([])
    expect(pairForAsymmetryTrend([{ forceKg: 30, recordedAt: 0 }], [])).toEqual([])
  })

  it('pairs a same-time left and right record', () => {
    const result = pairForAsymmetryTrend(
      [{ forceKg: 35, recordedAt: 1000 }],
      [{ forceKg: 30, recordedAt: 1000 }],
    )
    expect(result).toHaveLength(1)
    expect(result[0].asymmetry.absoluteDiffKg).toBeCloseTo(5, 6)
    expect(result[0].asymmetry.strongerHand).toBe('left')
  })

  it('uses the later timestamp as the point timestamp', () => {
    const result = pairForAsymmetryTrend(
      [{ forceKg: 35, recordedAt: 1000 }],
      [{ forceKg: 30, recordedAt: 5000 }],
    )
    expect(result[0].timestampMs).toBe(5000)
  })

  it('does not pair records further apart than maxPairGapMs', () => {
    const result = pairForAsymmetryTrend(
      [{ forceKg: 35, recordedAt: 0 }],
      [{ forceKg: 30, recordedAt: 48 * HOUR_MS }],
      undefined,
      24 * HOUR_MS,
    )
    expect(result).toEqual([])
  })

  it('a right record is used at most once (no double-pairing)', () => {
    const result = pairForAsymmetryTrend(
      [
        { forceKg: 35, recordedAt: 1000 },
        { forceKg: 36, recordedAt: 1100 },
      ],
      [{ forceKg: 30, recordedAt: 1050 }], // exactly one right record, between the two lefts
    )
    expect(result).toHaveLength(1)
  })

  it('picks the nearest-in-time right record, not just the first one', () => {
    const result = pairForAsymmetryTrend(
      [{ forceKg: 35, recordedAt: 10_000 }],
      [
        { forceKg: 20, recordedAt: 0 }, // far
        { forceKg: 30, recordedAt: 9_800 }, // near
      ],
    )
    expect(result[0].asymmetry.absoluteDiffKg).toBeCloseTo(5, 6) // paired with the near one (35-30)
  })

  it('sorts results chronologically', () => {
    const result = pairForAsymmetryTrend(
      [
        { forceKg: 35, recordedAt: 5000 },
        { forceKg: 36, recordedAt: 1000 },
      ],
      [
        { forceKg: 30, recordedAt: 5000 },
        { forceKg: 31, recordedAt: 1000 },
      ],
    )
    expect(result.map((r) => r.timestampMs)).toEqual([1000, 5000])
  })

  it('passes through a custom threshold fraction to computeAsymmetry', () => {
    const result = pairForAsymmetryTrend(
      [{ forceKg: 35, recordedAt: 0 }],
      [{ forceKg: 30, recordedAt: 0 }],
      0.5, // very lenient threshold
    )
    expect(result[0].asymmetry.exceedsThreshold).toBe(false)
  })
})
