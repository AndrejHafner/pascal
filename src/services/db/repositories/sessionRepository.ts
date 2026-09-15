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

/**
 * One row per session for the History list — docs/04 "History: ...each row
 * shows date, exercise(s), set count, headline number (max or total TUT)."
 * Headline number is the session's single highest smoothed peak force
 * across all completed efforts, when any exist; total TUT is always shown
 * alongside it (not a fallback — see HistorySessionCard).
 */
export interface SessionSummaryRow {
  session: Session
  exerciseNames: string[]
  setCount: number
  headlinePeakForceKg: number | null
  totalTutMs: number
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

  /** Overall session notes — see docs/04 "Session summary": "Notes + tags, then Save." */
  async updateNotes(id: string, notes: string | null): Promise<void> {
    await this.db.runAsync(`UPDATE session SET notes = ? WHERE id = ?;`, notes, id)
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

  /**
   * The History list's per-page query — see docs/04 "History". One row per
   * session carrying set count, session-wide peak, and total TUT via
   * correlated subqueries; exercise names are fetched in a second,
   * per-session query rather than GROUP_CONCAT'd here, since SQLite's
   * GROUP_CONCAT(DISTINCT ...) has no custom-separator form and exercise
   * names are free text that may itself contain commas — splitting on ','
   * would be silently wrong for a name like "20mm edge, half crimp".
   * History pages are small (tens of sessions, not thousands), so the
   * extra per-session query is a correctness trade worth making.
   * Sessions with sets but zero *completed* efforts (all aborted) get
   * headlinePeakForceKg: null rather than 0 — 0 kg is a real reading, not
   * "no data."
   */
  async listWithSummary(limit = 50, offset = 0): Promise<SessionSummaryRow[]> {
    const rows = await this.db.getAllAsync<{
      id: string
      started_at: number
      ended_at: number | null
      bodyweight_kg: number
      notes: string | null
      set_count: number
      headline_peak_force_kg: number | null
      total_tut_ms: number | null
    }>(
      `SELECT
         s.id, s.started_at, s.ended_at, s.bodyweight_kg, s.notes,
         (SELECT COUNT(*) FROM training_set ts3 WHERE ts3.session_id = s.id) AS set_count,
         (
           SELECT MAX(ef.peak_force_smoothed_kg)
           FROM effort ef JOIN training_set ts4 ON ts4.id = ef.set_id
           WHERE ts4.session_id = s.id AND ef.status = 'completed'
         ) AS headline_peak_force_kg,
         (
           SELECT COALESCE(SUM(ef2.time_under_tension_ms), 0)
           FROM effort ef2 JOIN training_set ts5 ON ts5.id = ef2.set_id
           WHERE ts5.session_id = s.id AND ef2.status = 'completed'
         ) AS total_tut_ms
       FROM session s
       ORDER BY s.started_at DESC
       LIMIT ? OFFSET ?;`,
      limit,
      offset,
    )

    const summaries: SessionSummaryRow[] = []
    for (const row of rows) {
      const nameRows = await this.db.getAllAsync<{ name: string }>(
        `SELECT DISTINCT e.name AS name
         FROM training_set ts JOIN exercise e ON e.id = ts.exercise_id
         WHERE ts.session_id = ?
         ORDER BY e.name ASC;`,
        row.id,
      )
      summaries.push({
        session: fromRow(row),
        exerciseNames: nameRows.map((n) => n.name),
        setCount: row.set_count,
        headlinePeakForceKg: row.headline_peak_force_kg,
        totalTutMs: row.total_tut_ms ?? 0,
      })
    }
    return summaries
  }
}
