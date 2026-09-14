import type { SQLiteDatabase } from 'expo-sqlite'
import type { Session } from '../../../core/types'
import { newId } from '../id'

interface SessionRow {
  id: string
  started_at: number
  ended_at: number | null
  bodyweight_kg: number
  notes: string | null
}

function fromRow(row: SessionRow): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    bodyweightKg: row.bodyweight_kg,
    notes: row.notes,
  }
}

export class SessionRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async start(input: { bodyweightKg: number; notes?: string | null }): Promise<Session> {
    const session: Session = {
      id: newId(),
      startedAt: Date.now(),
      endedAt: null,
      bodyweightKg: input.bodyweightKg,
      notes: input.notes ?? null,
    }
    await this.db.runAsync(
      `INSERT INTO session (id, started_at, ended_at, bodyweight_kg, notes)
       VALUES (?, ?, ?, ?, ?);`,
      session.id,
      session.startedAt,
      session.endedAt,
      session.bodyweightKg,
      session.notes,
    )
    return session
  }

  async end(id: string, endedAt: number = Date.now()): Promise<void> {
    await this.db.runAsync(`UPDATE session SET ended_at = ? WHERE id = ?;`, endedAt, id)
  }

  async getById(id: string): Promise<Session | null> {
    const row = await this.db.getFirstAsync<SessionRow>(`SELECT * FROM session WHERE id = ?;`, id)
    return row ? fromRow(row) : null
  }

  /** Most recent session with no ended_at — see docs/04 "resume unfinished session". */
  async getUnfinished(): Promise<Session | null> {
    const row = await this.db.getFirstAsync<SessionRow>(
      `SELECT * FROM session WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1;`,
    )
    return row ? fromRow(row) : null
  }

  async listRecent(limit = 50): Promise<Session[]> {
    const rows = await this.db.getAllAsync<SessionRow>(
      `SELECT * FROM session ORDER BY started_at DESC LIMIT ?;`,
      limit,
    )
    return rows.map(fromRow)
  }
}
