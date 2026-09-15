import { createTestDatabase } from '../testUtils/sqliteTestDb'
import { runMigrations } from '../../src/services/db/migrator'
import { migrations } from '../../src/services/db/migrations'
import { createRepositories } from '../../src/services/db/repositories'
import type { SQLiteDatabase } from 'expo-sqlite'

async function setup(): Promise<{
  db: SQLiteDatabase
  repos: ReturnType<typeof createRepositories>
}> {
  const db = createTestDatabase()
  await runMigrations(db, migrations)
  await db.execAsync(`PRAGMA foreign_keys = ON;`)
  return { db, repos: createRepositories(db) }
}

describe('SessionPlanRepository', () => {
  it('creates a plan with currentStep defaulting to 0', async () => {
    const { repos } = await setup()
    const session = await repos.sessions.start({ bodyweightKg: 80 })

    const plan = await repos.sessionPlans.create(
      session.id,
      JSON.stringify([{ kind: 'max_effort' }]),
    )
    expect(plan.currentStep).toBe(0)
    expect(plan.sessionId).toBe(session.id)
  })

  it('round-trips arbitrary steps JSON', async () => {
    const { repos } = await setup()
    const session = await repos.sessions.start({ bodyweightKg: 80 })
    const steps = [{ kind: 'max_effort', exerciseId: 'ex-1', attempts: 3 }]

    await repos.sessionPlans.create(session.id, JSON.stringify(steps))
    const fetched = await repos.sessionPlans.getBySessionId(session.id)

    expect(JSON.parse(fetched!.stepsJson)).toEqual(steps)
  })

  it('updateCurrentStep persists progress through the plan', async () => {
    const { repos } = await setup()
    const session = await repos.sessions.start({ bodyweightKg: 80 })
    const plan = await repos.sessionPlans.create(session.id, '[]')

    await repos.sessionPlans.updateCurrentStep(plan.id, 2)
    const fetched = await repos.sessionPlans.getBySessionId(session.id)

    expect(fetched?.currentStep).toBe(2)
  })

  it('returns null when a session has no plan', async () => {
    const { repos } = await setup()
    const session = await repos.sessions.start({ bodyweightKg: 80 })
    expect(await repos.sessionPlans.getBySessionId(session.id)).toBeNull()
  })

  it('cascade-deletes the plan when its session is deleted', async () => {
    const { db, repos } = await setup()
    const session = await repos.sessions.start({ bodyweightKg: 80 })
    await repos.sessionPlans.create(session.id, '[]')

    await db.runAsync(`DELETE FROM session WHERE id = ?;`, session.id)

    expect(await repos.sessionPlans.getBySessionId(session.id)).toBeNull()
  })
})
