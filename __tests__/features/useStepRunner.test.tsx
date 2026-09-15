import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useStepRunner } from '../../src/features/session/useStepRunner'
import type { MaxEffortStep, TargetBandStep } from '../../src/core/session/sessionPlan'
import { createTestDatabase } from '../testUtils/sqliteTestDb'
import { runMigrations } from '../../src/services/db/migrator'
import { migrations } from '../../src/services/db/migrations'
import { createRepositories } from '../../src/services/db/repositories'

async function setup() {
  const db = createTestDatabase()
  await runMigrations(db, migrations)
  await db.execAsync(`PRAGMA foreign_keys = ON;`)
  const repos = createRepositories(db)

  const exercise = await repos.exercises.create({
    name: 'Block Pull',
    gripType: 'half-crimp',
    edgeDepthMm: 20,
    modality: 'block_pull',
    notes: null,
  })
  const session = await repos.sessions.start({ bodyweightKg: 80 })

  return { repos, exercise, session }
}

/** Simulates what a mounted live-session component would have persisted for one hand's completed Effort. */
async function completeEffort(
  repos: Awaited<ReturnType<typeof setup>>['repos'],
  trainingSetId: string,
  hand: 'left' | 'right',
  peakForceSmoothedKg: number,
) {
  const effort = await repos.efforts.start({ setId: trainingSetId, hand, deviceType: 'emulator' })
  await repos.efforts.end(
    effort.id,
    'completed',
    {
      peakForceSmoothedKg,
      smoothingWindowMs: 1000,
      peakForceInstantKg: peakForceSmoothedKg + 2,
      meanForceKg: peakForceSmoothedKg * 0.8,
      impulseKgS: 100,
      timeUnderTensionMs: null,
      timeInBandMs: null,
      timeAboveBandMs: null,
      timeBelowBandMs: null,
      timeToPeakMs: 500,
      timeToTargetMs: null,
      fatigueIndex: null,
    },
    60,
  )
  return effort.id
}

describe('useStepRunner — max_effort step', () => {
  it('creates TrainingSets one at a time up to `attempts`, then completes with the best per hand', async () => {
    const { repos, exercise, session } = await setup()
    const step: MaxEffortStep = {
      kind: 'max_effort',
      exerciseId: exercise.id,
      attempts: 3,
      pullDurationMs: 3000,
      restBetweenAttemptsMs: 90_000,
      smoothingWindowMs: 1000,
    }

    const { result } = renderHook(() =>
      useStepRunner({ sessionId: session.id, step, stepIndex: 0, priorStepResults: [] }, repos),
    )

    await waitFor(() => expect(result.current.activeSet).not.toBeNull())
    expect(result.current.totalSets).toBe(3)
    expect(result.current.currentSetIndex).toBe(0)

    const set1Id = result.current.activeSet!.trainingSetId
    await completeEffort(repos, set1Id, 'left', 30)
    await completeEffort(repos, set1Id, 'right', 35)
    act(() => result.current.onSetComplete(set1Id))
    await waitFor(() => expect(result.current.currentSetIndex).toBe(1))
    await waitFor(() => expect(result.current.activeSet).not.toBeNull())

    const set2Id = result.current.activeSet!.trainingSetId
    expect(set2Id).not.toBe(set1Id)
    await completeEffort(repos, set2Id, 'left', 38) // best left attempt
    await completeEffort(repos, set2Id, 'right', 33)
    act(() => result.current.onSetComplete(set2Id))
    await waitFor(() => expect(result.current.currentSetIndex).toBe(2))
    await waitFor(() => expect(result.current.activeSet).not.toBeNull())

    const set3Id = result.current.activeSet!.trainingSetId
    await completeEffort(repos, set3Id, 'left', 34)
    await completeEffort(repos, set3Id, 'right', 40) // best right attempt
    act(() => result.current.onSetComplete(set3Id))

    await waitFor(() => expect(result.current.phase).toBe('complete'))
    expect(result.current.result?.left?.forceKg).toBe(38)
    expect(result.current.result?.right?.forceKg).toBe(40)
  })

  it('each attempt is a distinct TrainingSet with a distinct plan (setCount 1 per attempt)', async () => {
    const { repos, exercise, session } = await setup()
    const step: MaxEffortStep = {
      kind: 'max_effort',
      exerciseId: exercise.id,
      attempts: 1,
      pullDurationMs: 3000,
      restBetweenAttemptsMs: 90_000,
      smoothingWindowMs: 1000,
    }

    const { result } = renderHook(() =>
      useStepRunner({ sessionId: session.id, step, stepIndex: 0, priorStepResults: [] }, repos),
    )

    await waitFor(() => expect(result.current.activeSet).not.toBeNull())
    expect(result.current.activeSet?.setPlan.workDurationMs).toBe(3000)
    expect(result.current.activeSet?.band).toBeNull()

    const trainingSets = await repos.trainingSets.listBySession(session.id)
    expect(trainingSets).toHaveLength(1)
    expect(trainingSets[0].kind).toBe('max_effort')
  })
})

describe('useStepRunner — target_band step', () => {
  it('is blocked_no_max when no max record exists for the exercise', async () => {
    const { repos, exercise, session } = await setup()
    const step: TargetBandStep = {
      kind: 'target_band',
      exerciseId: exercise.id,
      maxSource: { kind: 'latest_max' },
      targetPercent: 80,
      toleranceKg: 2,
      workDurationMs: 10_000,
      interHandRestMs: 5000,
      interSetRestMs: 180_000,
      setCount: 3,
    }

    const { result } = renderHook(() =>
      useStepRunner({ sessionId: session.id, step, stepIndex: 0, priorStepResults: [] }, repos),
    )

    await waitFor(() => expect(result.current.phase).toBe('blocked_no_max'))
    expect(result.current.activeSet).toBeNull()
  })

  it('resolves the band from the latest DB max and creates sets against it', async () => {
    const { repos, exercise, session } = await setup()

    const set = await repos.trainingSets.create({
      sessionId: session.id,
      exerciseId: exercise.id,
      kind: 'max_effort',
      ordinal: 0,
      sourceMaxEffortId: null,
      targetPercent: null,
      targetForceKg: null,
      toleranceBandKg: null,
      plannedWorkMs: 3000,
      repWorkMs: null,
      repRestMs: null,
      repCount: null,
      interHandRestMs: 5000,
      interSetRestMs: 90_000,
    })
    const effort = await repos.efforts.start({
      setId: set.id,
      hand: 'left',
      deviceType: 'emulator',
    })
    await repos.maxRecords.create({
      exerciseId: exercise.id,
      hand: 'left',
      effortId: effort.id,
      forceKg: 40,
      smoothingWindowMs: 1000,
      rule: 'best_attempt',
      bodyweightKgAtTest: 80,
    })

    const step: TargetBandStep = {
      kind: 'target_band',
      exerciseId: exercise.id,
      maxSource: { kind: 'latest_max' },
      targetPercent: 80,
      toleranceKg: 2,
      workDurationMs: 10_000,
      interHandRestMs: 5000,
      interSetRestMs: 180_000,
      setCount: 2,
    }

    const { result } = renderHook(() =>
      useStepRunner({ sessionId: session.id, step, stepIndex: 1, priorStepResults: [] }, repos),
    )

    await waitFor(() => expect(result.current.activeSet).not.toBeNull())
    expect(result.current.activeSet?.band?.targetKg).toBeCloseTo(32, 6) // 80% of 40
    expect(result.current.activeSet?.band?.toleranceKg).toBe(2)
    expect(result.current.totalSets).toBe(2)
  })

  it('resolves the band from a prior same-session step instead of the DB', async () => {
    const { repos, exercise, session } = await setup()

    const step: TargetBandStep = {
      kind: 'target_band',
      exerciseId: exercise.id,
      maxSource: { kind: 'session_step', stepIndex: 0 },
      targetPercent: 80,
      toleranceKg: 2,
      workDurationMs: 10_000,
      interHandRestMs: 5000,
      interSetRestMs: 180_000,
      setCount: 1,
    }

    const { result } = renderHook(() =>
      useStepRunner(
        {
          sessionId: session.id,
          step,
          stepIndex: 1,
          priorStepResults: [
            { stepIndex: 0, bestByHand: { left: { forceKg: 50, recordedAt: Date.now() } } },
          ],
        },
        repos,
      ),
    )

    await waitFor(() => expect(result.current.activeSet).not.toBeNull())
    expect(result.current.activeSet?.band?.targetKg).toBeCloseTo(40, 6) // 80% of 50
  })

  it('runs setCount sets and completes with the best peak across them', async () => {
    const { repos, exercise, session } = await setup()

    const priorEffort = await repos.trainingSets
      .create({
        sessionId: session.id,
        exerciseId: exercise.id,
        kind: 'max_effort',
        ordinal: 0,
        sourceMaxEffortId: null,
        targetPercent: null,
        targetForceKg: null,
        toleranceBandKg: null,
        plannedWorkMs: 3000,
        repWorkMs: null,
        repRestMs: null,
        repCount: null,
        interHandRestMs: 5000,
        interSetRestMs: 90_000,
      })
      .then((s) => repos.efforts.start({ setId: s.id, hand: 'left', deviceType: 'emulator' }))
    await repos.maxRecords.create({
      exerciseId: exercise.id,
      hand: 'left',
      effortId: priorEffort.id,
      forceKg: 40,
      smoothingWindowMs: 1000,
      rule: 'best_attempt',
      bodyweightKgAtTest: 80,
    })

    const step: TargetBandStep = {
      kind: 'target_band',
      exerciseId: exercise.id,
      maxSource: { kind: 'latest_max' },
      targetPercent: 80,
      toleranceKg: 2,
      workDurationMs: 10_000,
      interHandRestMs: 5000,
      interSetRestMs: 180_000,
      setCount: 2,
    }

    const { result } = renderHook(() =>
      useStepRunner({ sessionId: session.id, step, stepIndex: 1, priorStepResults: [] }, repos),
    )

    await waitFor(() => expect(result.current.activeSet).not.toBeNull())
    const set1Id = result.current.activeSet!.trainingSetId
    await completeEffort(repos, set1Id, 'left', 33)
    act(() => result.current.onSetComplete(set1Id))
    await waitFor(() => expect(result.current.currentSetIndex).toBe(1))
    await waitFor(() => expect(result.current.activeSet).not.toBeNull())

    const set2Id = result.current.activeSet!.trainingSetId
    await completeEffort(repos, set2Id, 'left', 36)
    act(() => result.current.onSetComplete(set2Id))

    await waitFor(() => expect(result.current.phase).toBe('complete'))
    expect(result.current.result?.left?.forceKg).toBe(36)
  })
})
