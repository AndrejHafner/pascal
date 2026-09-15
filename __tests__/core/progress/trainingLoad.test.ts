import { aggregateWeeklyLoad } from '../../../src/core/progress/trainingLoad'

// Monday 2026-01-05 00:00 local time, arbitrary fixed anchor for readable offsets.
const MONDAY_MS = new Date(2026, 0, 5, 0, 0, 0, 0).getTime()
const DAY_MS = 24 * 60 * 60 * 1000

describe('aggregateWeeklyLoad', () => {
  it('returns nothing for no efforts', () => {
    expect(aggregateWeeklyLoad([])).toEqual([])
  })

  it('buckets a single effort into its week', () => {
    const result = aggregateWeeklyLoad([
      { startedAt: MONDAY_MS + DAY_MS, timeUnderTensionMs: 5000, impulseKgS: 100 },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].weekStartMs).toBe(MONDAY_MS)
    expect(result[0].totalTutMs).toBe(5000)
    expect(result[0].totalImpulseKgS).toBe(100)
    expect(result[0].effortCount).toBe(1)
  })

  it('sums multiple efforts within the same week', () => {
    const result = aggregateWeeklyLoad([
      { startedAt: MONDAY_MS, timeUnderTensionMs: 1000, impulseKgS: 10 },
      { startedAt: MONDAY_MS + 3 * DAY_MS, timeUnderTensionMs: 2000, impulseKgS: 20 },
      { startedAt: MONDAY_MS + 6 * DAY_MS, timeUnderTensionMs: 3000, impulseKgS: 30 },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].totalTutMs).toBe(6000)
    expect(result[0].totalImpulseKgS).toBe(60)
    expect(result[0].effortCount).toBe(3)
  })

  it('splits efforts across week boundaries into separate buckets', () => {
    const result = aggregateWeeklyLoad([
      { startedAt: MONDAY_MS, timeUnderTensionMs: 1000, impulseKgS: 10 },
      { startedAt: MONDAY_MS + 7 * DAY_MS, timeUnderTensionMs: 2000, impulseKgS: 20 },
    ])
    expect(result).toHaveLength(2)
    expect(result[1].weekStartMs).toBe(result[0].weekStartMs + 7 * DAY_MS)
  })

  it('a Sunday timestamp buckets into the week that started the preceding Monday', () => {
    const sundayMs = MONDAY_MS + 6 * DAY_MS + 23 * 60 * 60 * 1000 // Sun 23:00
    const result = aggregateWeeklyLoad([
      { startedAt: sundayMs, timeUnderTensionMs: 1000, impulseKgS: 10 },
    ])
    expect(result[0].weekStartMs).toBe(MONDAY_MS)
  })

  it('sorts buckets oldest-first regardless of input order', () => {
    const result = aggregateWeeklyLoad([
      { startedAt: MONDAY_MS + 14 * DAY_MS, timeUnderTensionMs: 1, impulseKgS: 1 },
      { startedAt: MONDAY_MS, timeUnderTensionMs: 1, impulseKgS: 1 },
      { startedAt: MONDAY_MS + 7 * DAY_MS, timeUnderTensionMs: 1, impulseKgS: 1 },
    ])
    expect(result.map((r) => r.weekStartMs)).toEqual([
      MONDAY_MS,
      MONDAY_MS + 7 * DAY_MS,
      MONDAY_MS + 14 * DAY_MS,
    ])
  })

  it('does not synthesize empty weeks between sparse data points', () => {
    const result = aggregateWeeklyLoad([
      { startedAt: MONDAY_MS, timeUnderTensionMs: 1, impulseKgS: 1 },
      { startedAt: MONDAY_MS + 28 * DAY_MS, timeUnderTensionMs: 1, impulseKgS: 1 },
    ])
    // Only the two weeks with real data — not 5 weeks of a zero-filled timeline.
    expect(result).toHaveLength(2)
  })

  it('handles a single sparse data point (the normal early state per docs/04)', () => {
    const result = aggregateWeeklyLoad([
      { startedAt: MONDAY_MS, timeUnderTensionMs: 4200, impulseKgS: 55 },
    ])
    expect(result).toHaveLength(1)
  })
})
