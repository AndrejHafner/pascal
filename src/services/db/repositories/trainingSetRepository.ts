import type { SQLiteDatabase } from 'expo-sqlite'
import type { TrainingSet } from '../../../core/types'
import { newId } from '../id'

interface TrainingSetRow {
  id: string
  session_id: string
  exercise_id: string
  kind: string
  ordinal: number
  source_max_effort_id: string | null
  target_percent: number | null
  target_force_kg: number | null
  tolerance_band_kg: number | null
  planned_work_ms: number | null
  rep_work_ms: number | null
  rep_rest_ms: number | null
  rep_count: number | null
  inter_hand_rest_ms: number
  inter_set_rest_ms: number
}

function fromRow(row: TrainingSetRow): TrainingSet {
  return {
    id: row.id,
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    kind: row.kind as TrainingSet['kind'],
    ordinal: row.ordinal,
    sourceMaxEffortId: row.source_max_effort_id,
    targetPercent: row.target_percent,
    targetForceKg: row.target_force_kg,
    toleranceBandKg: row.tolerance_band_kg,
    plannedWorkMs: row.planned_work_ms,
    repWorkMs: row.rep_work_ms,
    repRestMs: row.rep_rest_ms,
    repCount: row.rep_count,
    interHandRestMs: row.inter_hand_rest_ms,
    interSetRestMs: row.inter_set_rest_ms,
  }
}

export class TrainingSetRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async create(input: Omit<TrainingSet, 'id'>): Promise<TrainingSet> {
    const set: TrainingSet = { ...input, id: newId() }
    await this.db.runAsync(
      `INSERT INTO training_set (
         id, session_id, exercise_id, kind, ordinal,
         source_max_effort_id, target_percent, target_force_kg, tolerance_band_kg, planned_work_ms,
         rep_work_ms, rep_rest_ms, rep_count,
         inter_hand_rest_ms, inter_set_rest_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      set.id,
      set.sessionId,
      set.exerciseId,
      set.kind,
      set.ordinal,
      set.sourceMaxEffortId,
      set.targetPercent,
      set.targetForceKg,
      set.toleranceBandKg,
      set.plannedWorkMs,
      set.repWorkMs,
      set.repRestMs,
      set.repCount,
      set.interHandRestMs,
      set.interSetRestMs,
    )
    return set
  }

  async getById(id: string): Promise<TrainingSet | null> {
    const row = await this.db.getFirstAsync<TrainingSetRow>(
      `SELECT * FROM training_set WHERE id = ?;`,
      id,
    )
    return row ? fromRow(row) : null
  }

  async listBySession(sessionId: string): Promise<TrainingSet[]> {
    const rows = await this.db.getAllAsync<TrainingSetRow>(
      `SELECT * FROM training_set WHERE session_id = ? ORDER BY ordinal ASC;`,
      sessionId,
    )
    return rows.map(fromRow)
  }
}
