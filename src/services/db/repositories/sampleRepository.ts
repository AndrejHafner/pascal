import type { SQLiteDatabase } from 'expo-sqlite'
import type { Sample } from '../../../core/types'

/**
 * The highest-volume table — see docs/07-architecture.md "Database" and
 * "The sample pipeline". insertBatch is the only write path that matters:
 * it must be one transaction per drain (~150ms), never per-sample, per the
 * project-wide BLE constraint.
 */
export class SampleRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async insertBatch(samples: Sample[]): Promise<void> {
    if (samples.length === 0) return

    await this.db.withTransactionAsync(async () => {
      const statement = await this.db.prepareAsync(
        `INSERT INTO sample (effort_id, offset_ms, force_kg) VALUES ($effortId, $offsetMs, $forceKg);`,
      )
      try {
        for (const sample of samples) {
          await statement.executeAsync({
            $effortId: sample.effortId,
            $offsetMs: sample.offsetMs,
            $forceKg: sample.forceKg,
          })
        }
      } finally {
        await statement.finalizeAsync()
      }
    })
  }

  async listByEffort(effortId: string): Promise<Sample[]> {
    const rows = await this.db.getAllAsync<{
      effort_id: string
      offset_ms: number
      force_kg: number
    }>(`SELECT * FROM sample WHERE effort_id = ? ORDER BY offset_ms ASC;`, effortId)
    return rows.map((row) => ({
      effortId: row.effort_id,
      offsetMs: row.offset_ms,
      forceKg: row.force_kg,
    }))
  }

  async countByEffort(effortId: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) as n FROM sample WHERE effort_id = ?;`,
      effortId,
    )
    return row?.n ?? 0
  }
}
