import { createTestDatabase } from '../../testUtils/sqliteTestDb'
import { runMigrations } from '../../../src/services/db/migrator'
import { migrations } from '../../../src/services/db/migrations'
import { createRepositories } from '../../../src/services/db/repositories'
import { resolveTargetBandSource } from '../../../src/core/session/planPrescription'
import { selectBestAttempt } from '../../../src/core/session/selectBestAttempt'
import type { AttemptResult } from '../../../src/core/session/selectBestAttempt'
import type { StepResult } from '../../../src/core/session/planPrescription'
import type { MaxEffortStep, TargetBandStep } from '../../../src/core/session/sessionPlan'

/**
 * End-to-end proof of docs/08-roadmap.md Phase 5 "done when": "a complete
 * multi-set session runs start-to-finish on the emulator -- setup -> max
 * test both hands -> training sets at a % of that max -> summary -> saved
 * -- and the stored data is correct on inspection."
 *
 * Drives the actual repositories (real SQLite) and the same pure
 * selection/prescription logic useStepRunner and app/session/live.tsx use,
 * without mounting React (that's covered by useStepRunner.test.tsx and
 * useSessionRunner.test.tsx) -- this test's job is proving the DATA is
 * correct end to end: max_effort attempts -> best-attempt selection ->
 * MaxRecord -> target_band prescription off that exact MaxRecord ->
 * TrainingSets with the right targetForceKg -> session marked ended.
 */
describe('full session flow — setup through save (data correctness)', () => {
  async function setupDb() {
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
    return { repos, exercise }
  }

  it('max test (3 attempts, both hands) -> best selected -> MaxRecord -> target-band sets prescribed off it -> session saved', async () => {
    const { repos, exercise } = await setupDb()

    const session = await repos.sessions.start({ bodyweightKg: 78 })

    const maxStep: MaxEffortStep = {
      kind: 'max_effort',
      exerciseId: exercise.id,
      attempts: 3,
      pullDurationMs: 3000,
      restBetweenAttemptsMs: 90_000,
      smoothingWindowMs: 1000,
    }
    const trainStep: TargetBandStep = {
      kind: 'target_band',
      exerciseId: exercise.id,
      maxSource: { kind: 'session_step', stepIndex: 0 },
      targetPercent: 80,
      toleranceKg: 2,
      workDurationMs: 10_000,
      interHandRestMs: 5000,
      interSetRestMs: 180_000,
      setCount: 3,
    }

    const plan = await repos.sessionPlans.create(session.id, JSON.stringify([maxStep, trainStep]))
    expect(plan.currentStep).toBe(0)

    // --- Step 0: max_effort, 3 attempts, both hands ---
    const leftPeaks = [32, 38, 35] // best = 38
    const rightPeaks = [40, 36, 41] // best = 41
    const attempts: AttemptResult[] = []

    for (let attempt = 0; attempt < 3; attempt++) {
      const trainingSet = await repos.trainingSets.create({
        sessionId: session.id,
        exerciseId: exercise.id,
        kind: 'max_effort',
        ordinal: attempt,
        sourceMaxEffortId: null,
        targetPercent: null,
        targetForceKg: null,
        toleranceBandKg: null,
        plannedWorkMs: maxStep.pullDurationMs,
        repWorkMs: null,
        repRestMs: null,
        repCount: null,
        interHandRestMs: 5000,
        interSetRestMs: maxStep.restBetweenAttemptsMs,
      })

      for (const [hand, peaks] of [
        ['left', leftPeaks],
        ['right', rightPeaks],
      ] as const) {
        const effort = await repos.efforts.start({
          setId: trainingSet.id,
          hand,
          deviceType: 'emulator',
          deviceSequence: 'noisy-pull',
        })
        await repos.efforts.end(
          effort.id,
          'completed',
          {
            peakForceSmoothedKg: peaks[attempt],
            smoothingWindowMs: maxStep.smoothingWindowMs,
            peakForceInstantKg: peaks[attempt] + 3,
            meanForceKg: peaks[attempt] * 0.8,
            impulseKgS: 90,
            timeUnderTensionMs: null,
            timeInBandMs: null,
            timeAboveBandMs: null,
            timeBelowBandMs: null,
            timeToPeakMs: 600,
            timeToTargetMs: null,
            fatigueIndex: null,
          },
          60,
        )
        attempts.push({
          hand,
          effortId: effort.id,
          peakForceSmoothedKg: peaks[attempt],
          smoothingWindowMs: maxStep.smoothingWindowMs,
        })
      }
    }

    // This is exactly what app/session/live.tsx does when a max_effort
    // step's useStepRunner reaches phase 'complete'.
    const best = selectBestAttempt(attempts)
    expect(best.left?.forceKg).toBe(38)
    expect(best.right?.forceKg).toBe(41)

    for (const hand of ['left', 'right'] as const) {
      const b = best[hand]!
      await repos.maxRecords.create({
        exerciseId: exercise.id,
        hand,
        effortId: b.effortId,
        forceKg: b.forceKg,
        smoothingWindowMs: b.smoothingWindowMs,
        rule: 'best_attempt',
        bodyweightKgAtTest: session.bodyweightKg,
      })
    }

    const leftMaxRecord = await repos.maxRecords.getLatest(exercise.id, 'left')
    const rightMaxRecord = await repos.maxRecords.getLatest(exercise.id, 'right')
    expect(leftMaxRecord?.forceKg).toBe(38)
    expect(rightMaxRecord?.forceKg).toBe(41)

    const recordedAt = Date.now()
    const stepResults: StepResult[] = [
      {
        stepIndex: 0,
        bestByHand: {
          left: { forceKg: best.left!.forceKg, recordedAt },
          right: { forceKg: best.right!.forceKg, recordedAt },
        },
      },
    ]
    await repos.sessionPlans.updateCurrentStep(plan.id, 1)

    // --- Step 1: target_band, prescribed off step 0's just-recorded max ---
    const leftPrescription = resolveTargetBandSource(trainStep, 'left', null, stepResults)
    const rightPrescription = resolveTargetBandSource(trainStep, 'right', null, stepResults)
    expect(leftPrescription.status).toBe('ok')
    expect(rightPrescription.status).toBe('ok')
    if (leftPrescription.status !== 'ok' || rightPrescription.status !== 'ok') {
      throw new Error('unreachable')
    }
    expect(leftPrescription.targetForceKg).toBeCloseTo(38 * 0.8, 6) // 30.4
    expect(rightPrescription.targetForceKg).toBeCloseTo(41 * 0.8, 6) // 32.8
    // Same band drives both hands' UI zone/TUT (per useStepRunner's design
    // note) — left's resolution is the representative target.
    const bandTargetKg = leftPrescription.targetForceKg

    for (let setIndex = 0; setIndex < trainStep.setCount; setIndex++) {
      const trainingSet = await repos.trainingSets.create({
        sessionId: session.id,
        exerciseId: exercise.id,
        kind: 'target_band',
        ordinal: 1000 + setIndex,
        sourceMaxEffortId: null,
        targetPercent: trainStep.targetPercent,
        targetForceKg: bandTargetKg,
        toleranceBandKg: trainStep.toleranceKg,
        plannedWorkMs: trainStep.workDurationMs,
        repWorkMs: null,
        repRestMs: null,
        repCount: null,
        interHandRestMs: trainStep.interHandRestMs,
        interSetRestMs: trainStep.interSetRestMs,
      })

      for (const hand of ['left', 'right'] as const) {
        const effort = await repos.efforts.start({
          setId: trainingSet.id,
          hand,
          deviceType: 'emulator',
          deviceSequence: 'steady-pull',
        })
        await repos.efforts.end(
          effort.id,
          'completed',
          {
            peakForceSmoothedKg: bandTargetKg + 1,
            smoothingWindowMs: 1000,
            peakForceInstantKg: bandTargetKg + 3,
            meanForceKg: bandTargetKg,
            impulseKgS: 250,
            timeUnderTensionMs: 8000,
            timeInBandMs: 7000,
            timeAboveBandMs: 1000,
            timeBelowBandMs: 2000,
            timeToPeakMs: 500,
            timeToTargetMs: 300,
            fatigueIndex: null,
          },
          58,
        )
      }
    }
    await repos.sessionPlans.updateCurrentStep(plan.id, 2)

    // --- Verify what actually landed, per training-set and per-effort ---
    const allSets = await repos.trainingSets.listBySession(session.id)
    expect(allSets).toHaveLength(3 + trainStep.setCount) // 3 max attempts + 3 training sets
    const targetBandSets = allSets.filter((s) => s.kind === 'target_band')
    expect(targetBandSets).toHaveLength(3)
    for (const set of targetBandSets) {
      expect(set.targetForceKg).toBeCloseTo(30.4, 6)
      expect(set.targetPercent).toBe(80)
      expect(set.toleranceBandKg).toBe(2)
    }

    for (const set of targetBandSets) {
      const efforts = await repos.efforts.listBySet(set.id)
      expect(efforts).toHaveLength(2)
      for (const effort of efforts) {
        expect(effort.status).toBe('completed')
        expect(effort.timeUnderTensionMs).toBe(8000)
      }
    }

    // --- Session summary + save ---
    await repos.sessions.updateNotes(session.id, 'felt strong today')
    await repos.sessions.end(session.id)

    const savedSession = await repos.sessions.getById(session.id)
    expect(savedSession?.endedAt).not.toBeNull()
    expect(savedSession?.notes).toBe('felt strong today')

    // No unfinished session should remain once saved.
    expect(await repos.sessions.getUnfinished()).toBeNull()

    const finalPlan = await repos.sessionPlans.getBySessionId(session.id)
    expect(finalPlan?.currentStep).toBe(2) // both steps completed
  })
})
