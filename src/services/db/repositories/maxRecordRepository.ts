import type { SQLiteDatabase } from 'expo-sqlite'
import type { MaxRecord, Hand } from '../../../core/types'
import { newId } from '../id'

interface MaxRecordRow {
  id: string
  exercise_id: string
  hand: string
  effort_id: string
  force_kg: number
  smoothing_window_ms: number
  rule: string
  bodyweight_kg_at_test: number
  recorded_at: number
}

function fromRow(row: MaxRecordRow): MaxRecord {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    hand: row.hand as Hand,
    effortId: row.effort_id,
    forceKg: row.force_kg,
    smoothingWindowMs: row.smoothing_window_ms,
    rule: row.rule as MaxRecord['rule'],
    bodyweightKgAtTest: row.bodyweight_kg_at_test,
    recordedAt: row.recorded_at,
  }
}

export class MaxRecordRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async create(input: Omit<MaxRecord, 'id' | 'recordedAt'>): Promise<MaxRecord> {
    const record: MaxRecord = { ...input, id: newId(), recordedAt: Date.now() }
    await this.db.runAsync(
      `INSERT INTO max_record (
         id, exercise_id, hand, effort_id, force_kg, smoothing_window_ms, rule,
         bodyweight_kg_at_test, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      record.id,
      record.exerciseId,
      record.hand,
      record.effortId,
      record.forceKg,
      record.smoothingWindowMs,
      record.rule,
      record.bodyweightKgAtTest,
      record.recordedAt,
    )
    return record
  }

  /** Most recent max for exercise + hand — the default prescription source. See docs/03. */
  async getLatest(exerciseId: string, hand: Hand): Promise<MaxRecord | null> {
    const row = await this.db.getFirstAsync<MaxRecordRow>(
      `SELECT * FROM max_record WHERE exercise_id = ? AND hand = ?
       ORDER BY recorded_at DESC LIMIT 1;`,
      exerciseId,
      hand,
    )
    return row ? fromRow(row) : null
  }

  async listByExercise(exerciseId: string, hand: Hand): Promise<MaxRecord[]> {
    const rows = await this.db.getAllAsync<MaxRecordRow>(
      `SELECT * FROM max_record WHERE exercise_id = ? AND hand = ? ORDER BY recorded_at DESC;`,
      exerciseId,
      hand,
    )
    return rows.map(fromRow)
  }
}
