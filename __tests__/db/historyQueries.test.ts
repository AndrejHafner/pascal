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

/** Creates a session with one training set and one completed left-hand effort. */
async function createCompletedSet(
  repos: Repositories,
  exerciseId: string,
  opts: { peakForceSmoothedKg: number; timeUnderTensionMs: number; impulseKgS: number },
) {
  const session = await repos.sessions.start({ bodyweightKg: 80 })
  const set = await repos.trainingSets.create({
    sessionId: session.id,
    exerciseId,
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
      peakForceSmoothedKg: opts.peakForceSmoothedKg,
      smoothingWindowMs: 1000,
      peakForceInstantKg: opts.peakForceSmoothedKg,
      meanForceKg: opts.peakForceSmoothedKg * 0.8,
      impulseKgS: opts.impulseKgS,
      timeUnderTensionMs: opts.timeUnderTensionMs,
      timeInBandMs: null,
      timeAboveBandMs: null,
      timeBelowBandMs: null,
      timeToPeakMs: 500,
      timeToTargetMs: null,
      fatigueIndex: null,
    },
    60,
  )
  return { session, set, effort }
}

describe('SessionRepository.listWithSummary', () => {
  it('returns an empty list with no sessions', async () => {
    const { repos } = await setup()
    expect(await repos.sessions.listWithSummary()).toEqual([])
  })

  it('summarizes a session with one exercise, one set, and a headline peak', async () => {
    const { repos } = await setup()
    const exercise = await repos.exercises.create({
      name: '20mm edge',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    await createCompletedSet(repos, exercise.id, {
      peakForceSmoothedKg: 38,
      timeUnderTensionMs: 3000,
      impulseKgS: 90,
    })

    const summaries = await repos.sessions.listWithSummary()
    expect(summaries).toHaveLength(1)
    expect(summaries[0].exerciseNames).toEqual(['20mm edge'])
    expect(summaries[0].setCount).toBe(1)
    expect(summaries[0].headlinePeakForceKg).toBe(38)
    expect(summaries[0].totalTutMs).toBe(3000)
  })

  it('lists distinct exercise names across multiple sets in one session, sorted', async () => {
    const { repos } = await setup()
    const exerciseA = await repos.exercises.create({
      name: 'Z-crimp',
      gripType: 'crimp',
      edgeDepthMm: 10,
      modality: 'block_pull',
      notes: null,
    })
    const exerciseB = await repos.exercises.create({
      name: 'A-jug',
      gripType: 'open',
      edgeDepthMm: 30,
      modality: 'block_pull',
      notes: null,
    })
    const session = await repos.sessions.start({ bodyweightKg: 80 })
    for (const [ordinal, exercise] of [exerciseA, exerciseB].entries()) {
      await repos.trainingSets.create({
        sessionId: session.id,
        exerciseId: exercise.id,
        kind: 'max_effort',
        ordinal,
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
    }

    const summaries = await repos.sessions.listWithSummary()
    expect(summaries[0].exerciseNames).toEqual(['A-jug', 'Z-crimp']) // alphabetical, not insertion order
    expect(summaries[0].setCount).toBe(2)
  })

  it('a name containing a comma is not corrupted or split', async () => {
    const { repos } = await setup()
    const exercise = await repos.exercises.create({
      name: '20mm edge, half crimp',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    await createCompletedSet(repos, exercise.id, {
      peakForceSmoothedKg: 30,
      timeUnderTensionMs: 1000,
      impulseKgS: 10,
    })

    const summaries = await repos.sessions.listWithSummary()
    expect(summaries[0].exerciseNames).toEqual(['20mm edge, half crimp'])
  })

  it('headlinePeakForceKg is null, not 0, when a session has sets but no completed efforts', async () => {
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
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
      deviceSequence: 'dropout',
    })
    await repos.efforts.end(
      effort.id,
      'disconnected',
      {
        peakForceSmoothedKg: null,
        smoothingWindowMs: null,
        peakForceInstantKg: null,
        meanForceKg: null,
        impulseKgS: null,
        timeUnderTensionMs: null,
        timeInBandMs: null,
        timeAboveBandMs: null,
        timeBelowBandMs: null,
        timeToPeakMs: null,
        timeToTargetMs: null,
        fatigueIndex: null,
      },
      null,
    )

    const summaries = await repos.sessions.listWithSummary()
    expect(summaries[0].headlinePeakForceKg).toBeNull()
    expect(summaries[0].totalTutMs).toBe(0)
    expect(summaries[0].setCount).toBe(1)
  })

  it('orders sessions newest first and respects limit/offset', async () => {
    const { repos } = await setup()
    const first = await repos.sessions.start({ bodyweightKg: 80 })
    await new Promise((r) => setTimeout(r, 2))
    const second = await repos.sessions.start({ bodyweightKg: 80 })
    await new Promise((r) => setTimeout(r, 2))
    const third = await repos.sessions.start({ bodyweightKg: 80 })

    const page1 = await repos.sessions.listWithSummary(2, 0)
    expect(page1.map((s) => s.session.id)).toEqual([third.id, second.id])

    const page2 = await repos.sessions.listWithSummary(2, 2)
    expect(page2.map((s) => s.session.id)).toEqual([first.id])
  })
})

describe('MaxRecordRepository.listByExerciseChronological', () => {
  it('returns records oldest first', async () => {
    const { repos } = await setup()
    const exercise = await repos.exercises.create({
      name: 'Test',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    const { effort: effort1 } = await createCompletedSet(repos, exercise.id, {
      peakForceSmoothedKg: 30,
      timeUnderTensionMs: 1000,
      impulseKgS: 10,
    })
    await repos.maxRecords.create({
      exerciseId: exercise.id,
      hand: 'left',
      effortId: effort1.id,
      forceKg: 30,
      smoothingWindowMs: 1000,
      rule: 'best_attempt',
      bodyweightKgAtTest: 80,
    })
    await new Promise((r) => setTimeout(r, 2))
    const { effort: effort2 } = await createCompletedSet(repos, exercise.id, {
      peakForceSmoothedKg: 33,
      timeUnderTensionMs: 1000,
      impulseKgS: 10,
    })
    await repos.maxRecords.create({
      exerciseId: exercise.id,
      hand: 'left',
      effortId: effort2.id,
      forceKg: 33,
      smoothingWindowMs: 1000,
      rule: 'best_attempt',
      bodyweightKgAtTest: 80,
    })

    const chronological = await repos.maxRecords.listByExerciseChronological(exercise.id, 'left')
    expect(chronological.map((r) => r.forceKg)).toEqual([30, 33])
  })

  it('does not mix hands', async () => {
    const { repos } = await setup()
    const exercise = await repos.exercises.create({
      name: 'Test',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    const { effort } = await createCompletedSet(repos, exercise.id, {
      peakForceSmoothedKg: 30,
      timeUnderTensionMs: 1000,
      impulseKgS: 10,
    })
    await repos.maxRecords.create({
      exerciseId: exercise.id,
      hand: 'right',
      effortId: effort.id,
      forceKg: 30,
      smoothingWindowMs: 1000,
      rule: 'best_attempt',
      bodyweightKgAtTest: 80,
    })

    expect(await repos.maxRecords.listByExerciseChronological(exercise.id, 'left')).toEqual([])
  })
})

describe('MaxRecordRepository.getBestBefore', () => {
  it('returns null when no prior record exists (first-ever PB case)', async () => {
    const { repos } = await setup()
    const exercise = await repos.exercises.create({
      name: 'Test',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    const result = await repos.maxRecords.getBestBefore(exercise.id, 'left', Date.now())
    expect(result).toBeNull()
  })

  it('returns the highest-force prior record, not just the most recent one', async () => {
    const { repos } = await setup()
    const exercise = await repos.exercises.create({
      name: 'Test',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    const { effort: effort1 } = await createCompletedSet(repos, exercise.id, {
      peakForceSmoothedKg: 35,
      timeUnderTensionMs: 1000,
      impulseKgS: 10,
    })
    await repos.maxRecords.create({
      exerciseId: exercise.id,
      hand: 'left',
      effortId: effort1.id,
      forceKg: 35,
      smoothingWindowMs: 1000,
      rule: 'best_attempt',
      bodyweightKgAtTest: 80,
    })
    await new Promise((r) => setTimeout(r, 2))
    const { effort: effort2 } = await createCompletedSet(repos, exercise.id, {
      peakForceSmoothedKg: 30,
      timeUnderTensionMs: 1000,
      impulseKgS: 10,
    })
    // A more recent record with a LOWER force than the earlier one.
    await repos.maxRecords.create({
      exerciseId: exercise.id,
      hand: 'left',
      effortId: effort2.id,
      forceKg: 30,
      smoothingWindowMs: 1000,
      rule: 'best_attempt',
      bodyweightKgAtTest: 80,
    })

    const best = await repos.maxRecords.getBestBefore(exercise.id, 'left', Date.now() + 10_000)
    expect(best?.forceKg).toBe(35) // the higher one, even though it's older
  })

  it('excludes records at or after the given timestamp', async () => {
    const { repos } = await setup()
    const exercise = await repos.exercises.create({
      name: 'Test',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    const { effort } = await createCompletedSet(repos, exercise.id, {
      peakForceSmoothedKg: 40,
      timeUnderTensionMs: 1000,
      impulseKgS: 10,
    })
    const record = await repos.maxRecords.create({
      exerciseId: exercise.id,
      hand: 'left',
      effortId: effort.id,
      forceKg: 40,
      smoothingWindowMs: 1000,
      rule: 'best_attempt',
      bodyweightKgAtTest: 80,
    })

    const result = await repos.maxRecords.getBestBefore(exercise.id, 'left', record.recordedAt)
    expect(result).toBeNull()
  })
})

describe('EffortRepository.listCompletedForTrainingLoad', () => {
  it('excludes non-completed efforts', async () => {
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
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
      deviceSequence: 'dropout',
    })
    await repos.efforts.end(
      effort.id,
      'aborted',
      {
        peakForceSmoothedKg: null,
        smoothingWindowMs: null,
        peakForceInstantKg: null,
        meanForceKg: null,
        impulseKgS: 999, // would be a red flag if this leaked through despite being aborted
        timeUnderTensionMs: 999,
        timeInBandMs: null,
        timeAboveBandMs: null,
        timeBelowBandMs: null,
        timeToPeakMs: null,
        timeToTargetMs: null,
        fatigueIndex: null,
      },
      null,
    )

    expect(await repos.efforts.listCompletedForTrainingLoad(exercise.id)).toEqual([])
  })

  it('returns completed efforts with tut/impulse for the given exercise only', async () => {
    const { repos } = await setup()
    const exerciseA = await repos.exercises.create({
      name: 'A',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    const exerciseB = await repos.exercises.create({
      name: 'B',
      gripType: 'half-crimp',
      edgeDepthMm: 20,
      modality: 'block_pull',
      notes: null,
    })
    await createCompletedSet(repos, exerciseA.id, {
      peakForceSmoothedKg: 30,
      timeUnderTensionMs: 4000,
      impulseKgS: 60,
    })
    await createCompletedSet(repos, exerciseB.id, {
      peakForceSmoothedKg: 30,
      timeUnderTensionMs: 5000,
      impulseKgS: 70,
    })

    const result = await repos.efforts.listCompletedForTrainingLoad(exerciseA.id)
    expect(result).toHaveLength(1)
    expect(result[0].timeUnderTensionMs).toBe(4000)
    expect(result[0].impulseKgS).toBe(60)
  })
})
