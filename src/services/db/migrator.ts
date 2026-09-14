import type { SQLiteDatabase } from 'expo-sqlite'

export interface Migration {
  /** Sequential, starting at 1. Never reused or reordered once released. */
  version: number
  name: string
  up: (db: SQLiteDatabase) => Promise<void>
}

/**
 * Forward-only, numbered, tested migrations — see
 * docs/06-non-functional-and-open-source.md "Versioning / release": there
 * is no backup server, so a destructive migration is unrecoverable. Every
 * schema change ships as a new Migration here, never an edit to an old one.
 */
export async function runMigrations(
  db: SQLiteDatabase,
  migrations: Migration[],
): Promise<{ from: number; to: number; applied: number[] }> {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);`)

  const row = await db.getFirstAsync<{ version: number }>(
    `SELECT version FROM schema_version LIMIT 1;`,
  )
  const currentVersion = row?.version ?? 0

  const ordered = [...migrations].sort((a, b) => a.version - b.version)
  const pending = ordered.filter((m) => m.version > currentVersion)

  const applied: number[] = []
  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      await migration.up(db)
      if (currentVersion === 0 && applied.length === 0) {
        await db.execAsync(`DELETE FROM schema_version;`)
        await db.runAsync(`INSERT INTO schema_version (version) VALUES (?);`, migration.version)
      } else {
        await db.runAsync(`UPDATE schema_version SET version = ?;`, migration.version)
      }
    })
    applied.push(migration.version)
  }

  return {
    from: currentVersion,
    to: applied.length > 0 ? applied[applied.length - 1] : currentVersion,
    applied,
  }
}
