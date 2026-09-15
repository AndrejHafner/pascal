import { createTestDatabase } from '../testUtils/sqliteTestDb'
import { runMigrations } from '../../src/services/db/migrator'
import { migrations } from '../../src/services/db/migrations'

describe('migrator', () => {
  it('applies all registered migrations to a fresh database', async () => {
    const db = createTestDatabase()
    const result = await runMigrations(db, migrations)

    expect(result.from).toBe(0)
    expect(result.to).toBe(migrations[migrations.length - 1].version)
    expect(result.applied).toEqual(migrations.map((m) => m.version))
  })

  it('creates every table the schema requires', async () => {
    const db = createTestDatabase()
    await runMigrations(db, migrations)

    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';`,
    )
    const names = tables.map((t) => t.name).sort()

    expect(names).toEqual(
      [
        'app_setting',
        'effort',
        'exercise',
        'max_record',
        'sample',
        'schema_version',
        'session',
        'session_plan',
        'training_set',
      ].sort(),
    )
  })

  it('is idempotent — running again applies nothing new', async () => {
    const db = createTestDatabase()
    await runMigrations(db, migrations)
    const second = await runMigrations(db, migrations)

    expect(second.applied).toEqual([])
    expect(second.from).toBe(second.to)
  })

  it('never re-runs an already-applied migration (forward-only)', async () => {
    const db = createTestDatabase()
    let runCount = 0
    const trackedMigrations = [
      {
        version: 1,
        name: 'tracked',
        up: async (database: typeof db) => {
          runCount++
          await database.execAsync(`CREATE TABLE t (id TEXT PRIMARY KEY);`)
        },
      },
    ]

    await runMigrations(db, trackedMigrations)
    await runMigrations(db, trackedMigrations)

    expect(runCount).toBe(1)
  })
})
