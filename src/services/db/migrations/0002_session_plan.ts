import type { SQLiteDatabase } from 'expo-sqlite'
import type { Migration } from '../migrator'

/**
 * A session_plan row is the draft SessionPlan (docs 08 Phase 5) a user
 * builds in Session setup, persisted before the session's live screen
 * even opens. This is what makes "resume unfinished session" (docs/04)
 * possible if the app is killed between setup and finishing a session —
 * the plan and progress through it survive, not just individual
 * TrainingSet rows. steps_json is the serialized SessionStep[]; the shape
 * lives in application code (src/core/session/sessionPlan.ts), not SQL,
 * per docs/07's "core has no framework/storage assumptions" — this table
 * only needs to store and retrieve opaque plan JSON, not query into it.
 */
export const migration0002SessionPlan: Migration = {
  version: 2,
  name: 'session_plan',
  up: async (db: SQLiteDatabase) => {
    await db.execAsync(`
      CREATE TABLE session_plan (
        id            TEXT PRIMARY KEY,
        session_id    TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
        steps_json    TEXT NOT NULL,
        current_step  INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX idx_session_plan_session ON session_plan(session_id);
    `)
  },
}
