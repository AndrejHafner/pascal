import { createTestDatabase } from '../testUtils/sqliteTestDb'
import { runMigrations } from '../../src/services/db/migrator'
import { migrations } from '../../src/services/db/migrations'
import { createRepositories } from '../../src/services/db/repositories'

describe('AppSettingRepository', () => {
  it('returns null for a key that was never set', async () => {
    const db = createTestDatabase()
    await runMigrations(db, migrations)
    const repos = createRepositories(db)

    expect(await repos.appSettings.get('lastExportedAt')).toBeNull()
  })

  it('round-trips a value', async () => {
    const db = createTestDatabase()
    await runMigrations(db, migrations)
    const repos = createRepositories(db)

    await repos.appSettings.set('lastExportedAt', '1700000000000')
    expect(await repos.appSettings.get('lastExportedAt')).toBe('1700000000000')
  })

  it('set() upserts — a second set() for the same key overwrites, not duplicates', async () => {
    const db = createTestDatabase()
    await runMigrations(db, migrations)
    const repos = createRepositories(db)

    await repos.appSettings.set('lastExportedAt', '1')
    await repos.appSettings.set('lastExportedAt', '2')
    expect(await repos.appSettings.get('lastExportedAt')).toBe('2')
  })

  it('different keys are independent', async () => {
    const db = createTestDatabase()
    await runMigrations(db, migrations)
    const repos = createRepositories(db)

    await repos.appSettings.set('a', '1')
    await repos.appSettings.set('b', '2')
    expect(await repos.appSettings.get('a')).toBe('1')
    expect(await repos.appSettings.get('b')).toBe('2')
  })
})
