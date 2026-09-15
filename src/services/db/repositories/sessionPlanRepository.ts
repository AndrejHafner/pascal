import type { SQLiteDatabase } from 'expo-sqlite'
import type { SessionPlanRecord } from '../../../core/types'
import { newId } from '../id'

interface SessionPlanRow {
  id: string
  session_id: string
  steps_json: string
  current_step: number
  created_at: number
}

function fromRow(row: SessionPlanRow): SessionPlanRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    stepsJson: row.steps_json,
    currentStep: row.current_step,
    createdAt: row.created_at,
  }
}

export class SessionPlanRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async create(sessionId: string, stepsJson: string): Promise<SessionPlanRecord> {
    const plan: SessionPlanRecord = {
      id: newId(),
      sessionId,
      stepsJson,
      currentStep: 0,
      createdAt: Date.now(),
    }
    await this.db.runAsync(
      `INSERT INTO session_plan (id, session_id, steps_json, current_step, created_at)
       VALUES (?, ?, ?, ?, ?);`,
      plan.id,
      plan.sessionId,
      plan.stepsJson,
      plan.currentStep,
      plan.createdAt,
    )
    return plan
  }

  async updateCurrentStep(id: string, currentStep: number): Promise<void> {
    await this.db.runAsync(
      `UPDATE session_plan SET current_step = ? WHERE id = ?;`,
      currentStep,
      id,
    )
  }

  async getBySessionId(sessionId: string): Promise<SessionPlanRecord | null> {
    const row = await this.db.getFirstAsync<SessionPlanRow>(
      `SELECT * FROM session_plan WHERE session_id = ?;`,
      sessionId,
    )
    return row ? fromRow(row) : null
  }
}
