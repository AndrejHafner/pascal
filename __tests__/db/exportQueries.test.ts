import { createTestDatabase } from '../testUtils/sqliteTestDb'
import { runMigrations } from '../../src/services/db/migrator'
import { migrations } from '../../src/services/db/migrations'
import { createRepositories } from '../../src/services/db/repositories'
import type { SQLiteDatabase } from 'expo-sqlite'
import type { Repositories } from '../../src/services/db/repositories'

async function setup(): Promise<{ db: SQLiteDatabase; repos: Repositories }> {
  const db = createTestDatabase()
  await runMigrations(db, migrations)
  await db.execAsync(`PRAGMA foreign_keys = ON;`)
  return { db, repos: createRepositories(db) }
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const item of iterable) out.push(item)
  return out
}

describe('EffortRepository.listForExport', () => {
  it('returns nothing with no data', async () => {
    const { repos } = await setup()
    expect(await collect(repos.efforts.listForExport())).toEqual([])
  })

  it('includes full session/set/exercise context per docs/07, including smoothing window and edge depth', async () => {
    const { repos } = await setup()
    const exercise = await repos.exercises.create({
      name: '20mm edge',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    const session = await repos.sessions.start({ bodyweightKg: 78 })
    const set = await repos.trainingSets.create({
      sessionId: session.id,
      exerciseId: exercise.id,
      kind: 'max_effort',
      ordinal: 0,
      sourceMaxEffortId: null,
      targetPercent: null,
      targetForceKg: null,
      toleranceBandKg: null,
      plannedWorkMs: null,
      repWorkMs: null,
      repRestMs: null,
      repCount: null,
      interHandRestMs: 5000,
      interSetRestMs: 60000,
    })
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
      deviceSequence: 'noisy-pull',
    })
    await repos.efforts.end(
      effort.id,
      'completed',
      {
        peakForceSmoothedKg: 38,
        smoothingWindowMs: 1000,
        peakForceInstantKg: 39,
        meanForceKg: 33,
        impulseKgS: 120,
        timeUnderTensionMs: 4000,
        timeInBandMs: null,
        timeAboveBandMs: null,
        timeBelowBandMs: null,
        timeToPeakMs: 600,
        timeToTargetMs: null,
        fatigueIndex: null,
      },
      60,
    )

    const rows = await collect(repos.efforts.listForExport())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      exerciseName: '20mm edge',
      edgeDepthMm: 20,
      gripType: 'half-crimp',
      smoothingWindowMs: 1000,
      peakForceSmoothedKg: 38,
      hand: 'left',
      status: 'completed',
      sessionBodyweightKg: 78,
    })
  })

  it('orders rows by session start, then set ordinal, then hand', async () => {
    const { repos } = await setup()
    const exercise = await repos.exercises.create({
      name: 'Test',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    const session = await repos.sessions.start({ bodyweightKg: 80 })
    // Two training sets (ordinal 0 and 1); set 0 gets both hands, set 1
    // gets one hand — proves the ORDER BY sorts by set ordinal first, then
    // hand within a set, not by creation/insertion order.
    const set0 = await repos.trainingSets.create({
      sessionId: session.id,
      exerciseId: exercise.id,
      kind: 'max_effort',
      ordinal: 0,
      sourceMaxEffortId: null,
      targetPercent: null,
      targetForceKg: null,
      toleranceBandKg: null,
      plannedWorkMs: null,
      repWorkMs: null,
      repRestMs: null,
      repCount: null,
      interHandRestMs: 5000,
      interSetRestMs: 60000,
    })
    const set1 = await repos.trainingSets.create({
      sessionId: session.id,
      exerciseId: exercise.id,
      kind: 'max_effort',
      ordinal: 1,
      sourceMaxEffortId: null,
      targetPercent: null,
      targetForceKg: null,
      toleranceBandKg: null,
      plannedWorkMs: null,
      repWorkMs: null,
      repRestMs: null,
      repCount: null,
      interHandRestMs: 5000,
      interSetRestMs: 60000,
    })

    for (const [set, hand] of [
      [set0, 'right'],
      [set0, 'left'],
      [set1, 'left'],
    ] as const) {
      const effort = await repos.efforts.start({
        setId: set.id,
        hand,
        deviceType: 'emulator',
        deviceSequence: 'noisy-pull',
      })
      await repos.efforts.end(
        effort.id,
        'completed',
        {
          peakForceSmoothedKg: 30,
          smoothingWindowMs: 1000,
          peakForceInstantKg: 30,
          meanForceKg: 28,
          impulseKgS: 50,
          timeUnderTensionMs: 2000,
          timeInBandMs: null,
          timeAboveBandMs: null,
          timeBelowBandMs: null,
          timeToPeakMs: 500,
          timeToTargetMs: null,
          fatigueIndex: null,
        },
        60,
      )
    }

    const rows = await collect(repos.efforts.listForExport())
    expect(rows.map((r) => [r.setOrdinal, r.hand])).toEqual([
      [0, 'left'],
      [0, 'right'],
      [1, 'left'],
    ])
  })
})

describe('SampleRepository.listAllForExport', () => {
  it('returns nothing with no samples', async () => {
    const { repos } = await setup()
    expect(await collect(repos.samples.listAllForExport())).toEqual([])
  })

  it('streams every sample across every effort, grouped by effort then offset', async () => {
    const { repos } = await setup()
    const exercise = await repos.exercises.create({
      name: 'Test',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    const session = await repos.sessions.start({ bodyweightKg: 80 })
    const set = await repos.trainingSets.create({
      sessionId: session.id,
      exerciseId: exercise.id,
      kind: 'max_effort',
      ordinal: 0,
      sourceMaxEffortId: null,
      targetPercent: null,
      targetForceKg: null,
      toleranceBandKg: null,
      plannedWorkMs: null,
      repWorkMs: null,
      repRestMs: null,
      repCount: null,
      interHandRestMs: 5000,
      interSetRestMs: 60000,
    })
    const effortA = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
      deviceSequence: 'noisy-pull',
    })
    const effortB = await repos.efforts.start({
      setId: set.id,
      hand: 'right',
      deviceType: 'emulator',
      deviceSequence: 'noisy-pull',
    })
    await repos.samples.insertBatch([
      { effortId: effortB.id, offsetMs: 16, forceKg: 20 },
      { effortId: effortA.id, offsetMs: 32, forceKg: 10 },
      { effortId: effortA.id, offsetMs: 0, forceKg: 5 },
    ])

    // effort_id is a random UUID (see src/services/db/id.ts), so ORDER BY
    // effort_id ASC does not reflect insertion or creation order — assert
    // on the two properties that actually matter for a usable export:
    // every sample is present, and each effort's own samples are
    // contiguous and internally offset-ordered (not interleaved/scrambled).
    const rows = await collect(repos.samples.listAllForExport())
    expect(rows).toHaveLength(3)

    const forEffortA = rows.filter((r) => r.effortId === effortA.id)
    const forEffortB = rows.filter((r) => r.effortId === effortB.id)
    expect(forEffortA.map((r) => r.offsetMs)).toEqual([0, 32])
    expect(forEffortB.map((r) => r.offsetMs)).toEqual([16])

    const effortIdSequence = rows.map((r) => r.effortId)
    const firstIndexOf = (id: string) => effortIdSequence.indexOf(id)
    const lastIndexOf = (id: string) => effortIdSequence.lastIndexOf(id)
    // Contiguous: no sample from the other effort appears between this
    // effort's first and last occurrence.
    expect(lastIndexOf(effortA.id) - firstIndexOf(effortA.id)).toBe(forEffortA.length - 1)
    expect(lastIndexOf(effortB.id) - firstIndexOf(effortB.id)).toBe(forEffortB.length - 1)
  })
})
