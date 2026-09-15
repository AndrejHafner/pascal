// Training load aggregation — see docs/04-screens-and-ux.md "Progress":
// "Training load — TUT and impulse per week, per exercise." Pure so the
// week-bucketing convention (Monday-start, per ISO 8601) is unit-testable
// without a database.

export interface WeeklyLoadPoint {
  /** Epoch ms of that week's Monday 00:00 local time — the bucket's identity. */
  weekStartMs: number
  totalTutMs: number
  totalImpulseKgS: number
  effortCount: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Local-time Monday 00:00 for whatever week `timestampMs` falls in. */
function weekStartMs(timestampMs: number): number {
  const d = new Date(timestampMs)
  d.setHours(0, 0, 0, 0)
  // getDay(): 0=Sun..6=Sat. Days since the most recent Monday: Sun->6, Mon->0, Tue->1, ...
  const daysSinceMonday = (d.getDay() + 6) % 7
  return d.getTime() - daysSinceMonday * DAY_MS
}

/**
 * Buckets completed efforts into weekly totals, oldest week first. Weeks
 * with zero efforts between the first and last recorded week are NOT
 * synthesized — see docs/04 "sparse-data case": a chart of real points,
 * however few or far apart, not an interpolated/zero-filled timeline.
 */
export function aggregateWeeklyLoad(
  efforts: { startedAt: number; timeUnderTensionMs: number; impulseKgS: number }[],
): WeeklyLoadPoint[] {
  const byWeek = new Map<number, WeeklyLoadPoint>()

  for (const effort of efforts) {
    const bucket = weekStartMs(effort.startedAt)
    const existing = byWeek.get(bucket)
    if (existing) {
      existing.totalTutMs += effort.timeUnderTensionMs
      existing.totalImpulseKgS += effort.impulseKgS
      existing.effortCount += 1
    } else {
      byWeek.set(bucket, {
        weekStartMs: bucket,
        totalTutMs: effort.timeUnderTensionMs,
        totalImpulseKgS: effort.impulseKgS,
        effortCount: 1,
      })
    }
  }

  return Array.from(byWeek.values()).sort((a, b) => a.weekStartMs - b.weekStartMs)
}
