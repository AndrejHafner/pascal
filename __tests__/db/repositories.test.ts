import { createTestDatabase } from '../testUtils/sqliteTestDb'
import { runMigrations } from '../../src/services/db/migrator'
import { migrations } from '../../src/services/db/migrations'
import { createRepositories, type Repositories } from '../../src/services/db/repositories'
import type { SQLiteDatabase } from 'expo-sqlite'

async function setupDb(): Promise<{ db: SQLiteDatabase; repos: Repositories }> {
  const db = createTestDatabase()
  await runMigrations(db, migrations)
  await db.execAsync(`PRAGMA foreign_keys = ON;`)
  return { db, repos: createRepositories(db) }
}

describe('ExerciseRepository', () => {
  it('creates and reads back an exercise with required edge depth', async () => {
    const { repos } = await setupDb()
    const exercise = await repos.exercises.create({
      name: 'Block Pull',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })

    const fetched = await repos.exercises.getById(exercise.id)
    expect(fetched).toEqual(exercise)
  })

  it('rejects a modality outside the allowed set (CHECK constraint)', async () => {
    const { repos } = await setupDb()
    await expect(
      repos.exercises.create({
        name: 'Bad',
        gripType: 'open',
        edgeDepthMm: 20,
        // @ts-expect-error deliberately invalid to prove the DB-level CHECK, not just the type
        modality: 'nonsense',
        notes: null,
      }),
    ).rejects.toThrow()
  })

  it('lists exercises newest first', async () => {
    const { repos } = await setupDb()
    // created_at is Date.now(); force distinct timestamps rather than
    // relying on real-clock granularity between two calls in the same tick.
    const nowSpy = jest.spyOn(Date, 'now')
    nowSpy.mockReturnValueOnce(1000)
    const a = await repos.exercises.create({
      name: 'A',
      gripType: 'open',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    nowSpy.mockReturnValueOnce(2000)
    const b = await repos.exercises.create({
      name: 'B',
      gripType: 'open',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    nowSpy.mockRestore()

    const all = await repos.exercises.listAll()
    expect(all.map((e) => e.id)).toEqual([b.id, a.id])
  })
})

describe('SessionRepository', () => {
  it('starts a session with a bodyweight snapshot and no end time', async () => {
    const { repos } = await setupDb()
    const session = await repos.sessions.start({ bodyweightKg: 78.5 })

    expect(session.bodyweightKg).toBe(78.5)
    expect(session.endedAt).toBeNull()
  })

  it('finds the unfinished session for resume-on-launch (docs/04)', async () => {
    const { repos } = await setupDb()
    const finished = await repos.sessions.start({ bodyweightKg: 78 })
    await repos.sessions.end(finished.id)
    const unfinished = await repos.sessions.start({ bodyweightKg: 78 })

    const resumeCandidate = await repos.sessions.getUnfinished()
    expect(resumeCandidate?.id).toBe(unfinished.id)
  })

  it('returns null for getUnfinished when every session is ended', async () => {
    const { repos } = await setupDb()
    const session = await repos.sessions.start({ bodyweightKg: 78 })
    await repos.sessions.end(session.id)

    expect(await repos.sessions.getUnfinished()).toBeNull()
  })
})

async function createExerciseAndSession(repos: Repositories) {
  const exercise = await repos.exercises.create({
    name: 'Block Pull',
    gripType: 'half-crimp',
    edgeDepthMm: 20,
    modality: 'block_pull',
    notes: null,
  })
  const session = await repos.sessions.start({ bodyweightKg: 80 })
  return { exercise, session }
}

describe('TrainingSetRepository + EffortRepository', () => {
  it('creates a target_band set referencing a source max effort', async () => {
    const { repos } = await setupDb()
    const { exercise, session } = await createExerciseAndSession(repos)

    const maxSet = await repos.trainingSets.create({
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
      interSetRestMs: 180_000,
    })
    const maxEffort = await repos.efforts.start({
      setId: maxSet.id,
      hand: 'left',
      deviceType: 'emulator',
      deviceSequence: 'steady-pull',
    })

    const trainingSet = await repos.trainingSets.create({
      sessionId: session.id,
      exerciseId: exercise.id,
      kind: 'target_band',
      ordinal: 1,
      sourceMaxEffortId: maxEffort.id,
      targetPercent: 80,
      targetForceKg: 24,
      toleranceBandKg: 2,
      plannedWorkMs: 10_000,
      repWorkMs: null,
      repRestMs: null,
      repCount: null,
      interHandRestMs: 5000,
      interSetRestMs: 180_000,
    })

    const fetched = await repos.trainingSets.getById(trainingSet.id)
    expect(fetched?.sourceMaxEffortId).toBe(maxEffort.id)
    expect(fetched?.targetPercent).toBe(80)
  })

  it('enforces one effort per hand per set (UNIQUE set_id, hand)', async () => {
    const { repos } = await setupDb()
    const { exercise, session } = await createExerciseAndSession(repos)
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
      interSetRestMs: 180_000,
    })

    await repos.efforts.start({ setId: set.id, hand: 'left', deviceType: 'emulator' })
    await expect(
      repos.efforts.start({ setId: set.id, hand: 'left', deviceType: 'emulator' }),
    ).rejects.toThrow()
  })

  it('an effort ended with status completed and metrics persists them', async () => {
    const { repos } = await setupDb()
    const { exercise, session } = await createExerciseAndSession(repos)
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
      interSetRestMs: 180_000,
    })
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'right',
      deviceType: 'emulator',
      deviceSequence: 'noisy-pull',
    })

    await repos.efforts.end(
      effort.id,
      'completed',
      {
        peakForceSmoothedKg: 34.2,
        smoothingWindowMs: 1000,
        peakForceInstantKg: 36.1,
        meanForceKg: 30.5,
        impulseKgS: 150.3,
        timeUnderTensionMs: 5000,
        timeInBandMs: 4000,
        timeAboveBandMs: 1000,
        timeBelowBandMs: 500,
        timeToPeakMs: 800,
        timeToTargetMs: 300,
        fatigueIndex: 0.12,
      },
      58.7,
    )

    const fetched = await repos.efforts.getById(effort.id)
    expect(fetched?.status).toBe('completed')
    expect(fetched?.peakForceSmoothedKg).toBe(34.2)
    expect(fetched?.sampleRateHz).toBe(58.7)
    expect(fetched?.endedAt).not.toBeNull()
  })
})

describe('SampleRepository', () => {
  it('batch-inserts samples in one transaction and reads them back in order', async () => {
    const { repos } = await setupDb()
    const { exercise, session } = await createExerciseAndSession(repos)
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
      interSetRestMs: 180_000,
    })
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
    })

    const samples = Array.from({ length: 200 }, (_, i) => ({
      effortId: effort.id,
      offsetMs: i * 16,
      forceKg: 20 + Math.sin(i / 10),
    }))
    await repos.samples.insertBatch(samples)

    const count = await repos.samples.countByEffort(effort.id)
    expect(count).toBe(200)

    const fetched = await repos.samples.listByEffort(effort.id)
    expect(fetched[0].offsetMs).toBe(0)
    expect(fetched[fetched.length - 1].offsetMs).toBe(199 * 16)
  })

  it('cascade-deletes samples when the owning session is deleted (docs/07)', async () => {
    const { db, repos } = await setupDb()
    const { exercise, session } = await createExerciseAndSession(repos)
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
      interSetRestMs: 180_000,
    })
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
    })
    await repos.samples.insertBatch([{ effortId: effort.id, offsetMs: 0, forceKg: 10 }])

    await db.runAsync(`DELETE FROM session WHERE id = ?;`, session.id)

    expect(await repos.samples.countByEffort(effort.id)).toBe(0)
  })

  it('rejects a duplicate (effort_id, offset_ms) pair (WITHOUT ROWID PK)', async () => {
    const { repos } = await setupDb()
    const { exercise, session } = await createExerciseAndSession(repos)
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
      interSetRestMs: 180_000,
    })
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
    })

    await repos.samples.insertBatch([{ effortId: effort.id, offsetMs: 100, forceKg: 10 }])
    await expect(
      repos.samples.insertBatch([{ effortId: effort.id, offsetMs: 100, forceKg: 11 }]),
    ).rejects.toThrow()
  })
})

describe('MaxRecordRepository', () => {
  it('getLatest returns the most recently recorded max for exercise + hand', async () => {
    const { repos } = await setupDb()
    const { exercise, session } = await createExerciseAndSession(repos)
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
      interSetRestMs: 180_000,
    })
    const effortOld = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
    })

    // recorded_at is Date.now(); force distinct timestamps rather than
    // relying on real-clock granularity between two calls in the same tick.
    const nowSpy = jest.spyOn(Date, 'now')
    nowSpy.mockReturnValueOnce(1000)
    await repos.maxRecords.create({
      exerciseId: exercise.id,
      hand: 'left',
      effortId: effortOld.id,
      forceKg: 30,
      smoothingWindowMs: 1000,
      rule: 'best_attempt',
      bodyweightKgAtTest: 80,
    })
    nowSpy.mockRestore()
    // Second record for the same exercise+hand, created after — should win.
    const setB = await repos.trainingSets.create({
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
      interSetRestMs: 180_000,
    })
    const effortNew = await repos.efforts.start({
      setId: setB.id,
      hand: 'left',
      deviceType: 'emulator',
    })
    jest.spyOn(Date, 'now').mockReturnValueOnce(2000)
    const newer = await repos.maxRecords.create({
      exerciseId: exercise.id,
      hand: 'left',
      effortId: effortNew.id,
      forceKg: 33,
      smoothingWindowMs: 1000,
      rule: 'best_attempt',
      bodyweightKgAtTest: 80,
    })

    const latest = await repos.maxRecords.getLatest(exercise.id, 'left')
    expect(latest?.id).toBe(newer.id)
    expect(latest?.forceKg).toBe(33)
  })

  it('returns null when no max has been recorded for that hand yet', async () => {
    const { repos } = await setupDb()
    const { exercise } = await createExerciseAndSession(repos)
    expect(await repos.maxRecords.getLatest(exercise.id, 'right')).toBeNull()
  })
})
