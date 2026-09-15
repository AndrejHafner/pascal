import type { SQLiteDatabase } from 'expo-sqlite'
import type { Migration } from '../migrator'

/**
 * A generic key/value table for small app-level preferences that aren't
 * per-session or per-exercise data — starting with lastExportedAt (docs/06
 * "the app should periodically remind the user to export if they haven't
 * in a long while"), but shaped generically since Settings (docs/04) will
 * likely grow more of these (asymmetry threshold override, cue
 * preferences) without each needing its own migration/table.
 */
export const migration0003AppSetting: Migration = {
  version: 3,
  name: 'app_setting',
  up: async (db: SQLiteDatabase) => {
    await db.execAsync(`
      CREATE TABLE app_setting (
        key    TEXT PRIMARY KEY,
        value  TEXT NOT NULL
      );
    `)
  },
}
