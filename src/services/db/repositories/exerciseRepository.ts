import type { SQLiteDatabase } from 'expo-sqlite'
import type { Exercise } from '../../../core/types'
import { newId } from '../id'

interface ExerciseRow {
  id: string
  name: string
  grip_type: string
  edge_depth_mm: number
  modality: string
  notes: string | null
  created_at: number
}

function fromRow(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    gripType: row.grip_type,
    edgeDepthMm: row.edge_depth_mm,
    modality: row.modality as Exercise['modality'],
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export class ExerciseRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async create(input: Omit<Exercise, 'id' | 'createdAt'>): Promise<Exercise> {
    const exercise: Exercise = { ...input, id: newId(), createdAt: Date.now() }
    await this.db.runAsync(
      `INSERT INTO exercise (id, name, grip_type, edge_depth_mm, modality, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      exercise.id,
      exercise.name,
      exercise.gripType,
      exercise.edgeDepthMm,
      exercise.modality,
      exercise.notes,
      exercise.createdAt,
    )
    return exercise
  }

  async getById(id: string): Promise<Exercise | null> {
    const row = await this.db.getFirstAsync<ExerciseRow>(`SELECT * FROM exercise WHERE id = ?;`, id)
    return row ? fromRow(row) : null
  }

  async listAll(): Promise<Exercise[]> {
    const rows = await this.db.getAllAsync<ExerciseRow>(
      `SELECT * FROM exercise ORDER BY created_at DESC;`,
    )
    return rows.map(fromRow)
  }
}
