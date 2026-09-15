import Database from 'better-sqlite3'
import type { SQLiteDatabase } from 'expo-sqlite'

/**
 * Adapts better-sqlite3 (synchronous, real SQLite) to the subset of
 * expo-sqlite's async SQLiteDatabase API this project's repositories use.
 *
 * Why not mock the database: expo-sqlite is a native binding with no
 * in-memory JS fallback runnable under Jest, but the whole point of the
 * repository/migration tests is proving the actual SQL in schema.sql and
 * the repositories is valid and behaves correctly — a fake in-memory object
 * store would test nothing about the SQL itself. better-sqlite3 is real
 * SQLite, so schema.sql, migrations, and every query run for real here;
 * only the sync-vs-async calling convention differs from a real device.
 *
 * Deliberately test-only — never imported from src/.
 */
export function createTestDatabase(): SQLiteDatabase {
  const db = new Database(':memory:')

  const adapter = {
    execAsync: async (source: string) => {
      db.exec(source)
    },

    runAsync: async (source: string, ...params: unknown[]) => {
      const bindParams = normalizeParams(params)
      const info = db.prepare(source).run(bindParams as never)
      return { lastInsertRowId: Number(info.lastInsertRowid), changes: info.changes }
    },

    getFirstAsync: async <T>(source: string, ...params: unknown[]) => {
      const bindParams = normalizeParams(params)
      const row = db.prepare(source).get(bindParams as never)
      return (row ?? null) as T | null
    },

    getAllAsync: async <T>(source: string, ...params: unknown[]) => {
      const bindParams = normalizeParams(params)
      return db.prepare(source).all(bindParams as never) as T[]
    },

    getEachAsync: async function* <T>(source: string, ...params: unknown[]) {
      const bindParams = normalizeParams(params)
      for (const row of db.prepare(source).iterate(bindParams as never)) {
        yield row as T
      }
    },

    prepareAsync: async (source: string) => {
      const stmt = db.prepare(source)
      return {
        executeAsync: async (params: Record<string, unknown>) => {
          stmt.run(sqlitify(params) as never)
          return { getAllAsync: async () => [], getFirstAsync: async () => null }
        },
        finalizeAsync: async () => {
          // better-sqlite3 has no explicit finalize; statements are GC'd.
        },
      }
    },

    withTransactionAsync: async (task: () => Promise<void>) => {
      // better-sqlite3's transaction() wrapper is sync-only, so we drive
      // BEGIN/COMMIT/ROLLBACK by hand to allow an async task body — the
      // repositories under test rely on awaiting statement execution
      // inside the transaction.
      db.exec('BEGIN')
      try {
        await task()
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },

    closeAsync: async () => {
      db.close()
    },
  }

  return adapter as unknown as SQLiteDatabase
}

/** expo-sqlite accepts (string, ...values) or (string, bindObject). better-sqlite3
 * wants a single positional array or a single named-param object. */
function normalizeParams(params: unknown[]): unknown {
  if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null) {
    return sqlitify(params[0] as Record<string, unknown>)
  }
  return params.map(sqlitifyValue)
}

function sqlitify(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    // expo-sqlite named params use $name in SQL but bind as { name: value }.
    const bindKey = key.startsWith('$') ? key.slice(1) : key
    out[bindKey] = sqlitifyValue(value)
  }
  return out
}

function sqlitifyValue(value: unknown): unknown {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value === undefined) return null
  return value
}
