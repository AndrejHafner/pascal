import * as SQLite from 'expo-sqlite'
import type { SQLiteDatabase } from 'expo-sqlite'
import { migrations } from './migrations'
import { runMigrations } from './migrator'

export const DB_NAME = 'pascal.db'

let dbPromise: Promise<SQLiteDatabase> | null = null

/**
 * Opens (or returns the already-open) app database, with the pragmas
 * required by docs/07-architecture.md "Database": WAL for concurrent reads
 * during writes, synchronous=NORMAL (safe under WAL, much faster batch
 * inserts), foreign_keys=ON so ON DELETE CASCADE actually cascades.
 * Runs pending migrations before handing the connection back.
 */
export function openDatabase(name: string = DB_NAME): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(name)
      await applyPragmas(db)
      await runMigrations(db, migrations)
      return db
    })()
  }
  return dbPromise
}

async function applyPragmas(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `)
}

/** Test/dev only — closes and forgets the cached connection. */
export async function resetDatabaseConnection(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    await db.closeAsync()
    dbPromise = null
  }
}
