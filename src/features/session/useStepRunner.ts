import { useCallback, useEffect, useRef, useState } from 'react'
import type { SetPlan } from '../../core/protocol/machine'
import type { Band } from '../../core/metrics/band'
import type { SessionStep } from '../../core/session/sessionPlan'
import { selectBestAttempt } from '../../core/session/selectBestAttempt'
import type { AttemptResult, BestAttempt } from '../../core/session/selectBestAttempt'
import { resolveTargetBandSource } from '../../core/session/planPrescription'
import type { StepResult } from '../../core/session/planPrescription'
import type { Repositories } from '../../services/db/repositories'
import type { Hand } from '../../core/types'

export interface StepRunnerConfig {
  sessionId: string
  step: SessionStep
  stepIndex: number
  /** Results of earlier steps in this plan, for session_step maxSource resolution. */
  priorStepResults: StepResult[]
}

export type StepRunnerPhase = 'preparing' | 'running' | 'blocked_no_max' | 'complete'

/** What the currently-active set needs — the caller mounts a fresh runner keyed by trainingSetId. */
export interface ActiveSet {
  trainingSetId: string
  setPlan: SetPlan
  band: Band | null
}

export interface StepRunnerHandle {
  phase: StepRunnerPhase
  /**
   * Config for the currently-active set, or null while preparing/blocked/
   * complete/between-sets. The caller mounts its live-session runner
   * component with `key={activeSet.trainingSetId}` so React gives it a
   * fresh hook instance per set — useSessionRunner's internal state is
   * initialized once via useState's lazy initializer and does NOT reset
   * on prop changes, so a stable component keyed by id is what actually
   * resets it between attempts/sets, not a config change alone.
   */
  activeSet: ActiveSet | null
  /** Call when the caller's runner for activeSet reaches phase 'done'. */
  onSetComplete: (finishedTrainingSetId: string) => void
  currentSetIndex: number
  totalSets: number
  /** Populated once phase === 'complete'. */
  result: Partial<Record<Hand, BestAttempt>> | null
}

/**
 * Sequences the TrainingSet(s) a SessionStep expands to — a max-effort
 * step is N attempts (N separate TrainingSets, one per attempt per docs/03),
 * a target-band step is its configured setCount. The caller is responsible
 * for actually running each set (mounting a keyed useSessionRunner-backed
 * component per `activeSet`) and reporting completion via onSetComplete —
 * this hook only sequences TrainingSet creation and aggregates results.
 *
 * For a target-band step, the target force is resolved ONCE up front from
 * either the latest DB max or an earlier step in this plan (see
 * planPrescription.ts). If resolution fails, phase is 'blocked_no_max'
 * rather than silently proceeding with no band — "a % of nothing is
 * meaningless" (docs/04).
 */
export function useStepRunner(config: StepRunnerConfig, repos: Repositories): StepRunnerHandle {
  const [currentSetIndex, setCurrentSetIndex] = useState(0)
  const [activeSet, setActiveSet] = useState<ActiveSet | null>(null)
  const [attempts, setAttempts] = useState<AttemptResult[]>([])
  // max_effort has nothing to resolve asynchronously (no band lookup), so
  // it starts straight in 'running' — only target_band needs the effect
  // below to move it out of 'preparing'.
  const [phase, setPhase] = useState<StepRunnerPhase>(
    config.step.kind === 'max_effort' ? 'running' : 'preparing',
  )
  const [band, setBand] = useState<Band | null>(null)
  // In-flight guard for TrainingSet creation — a ref, not state, since it
  // exists purely to prevent a duplicate create() from a second effect run
  // before the first's async work resolves; it's never read by render.
  const creatingRef = useRef(false)

  const totalSets = config.step.kind === 'max_effort' ? config.step.attempts : config.step.setCount

  // Resolve the band once up front for target-band steps.
  useEffect(() => {
    if (config.step.kind !== 'target_band') return

    let cancelled = false
    void (async () => {
      const step = config.step
      if (step.kind !== 'target_band') return
      const latestLeft = await repos.maxRecords.getLatest(step.exerciseId, 'left')

      // One band drives both hands' zone/TUT logic — docs/03 doesn't
      // specify per-hand target bands; left's resolution is used as the
      // representative target. Each hand's actual result is still
      // compared independently at summary time.
      const resolved = resolveTargetBandSource(
        step,
        'left',
        latestLeft ? { forceKg: latestLeft.forceKg, recordedAt: latestLeft.recordedAt } : null,
        config.priorStepResults,
      )

      if (cancelled) return
      if (resolved.status === 'no_max') {
        setPhase('blocked_no_max')
        return
      }
      setBand({ targetKg: resolved.targetForceKg, toleranceKg: step.toleranceKg })
      setPhase('running')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.step, repos])

  // Create the TrainingSet row for the current set index once resolution
  // is done, there's no set already active, and the step isn't finished
  // (currentSetIndex >= totalSets is handled below as a derived value —
  // 'complete' is never stored as its own state transition here).
  useEffect(() => {
    if (phase !== 'running' || activeSet !== null || creatingRef.current) return
    if (currentSetIndex >= totalSets) return

    creatingRef.current = true
    createNextTrainingSet(config, currentSetIndex, band, repos)
      .then(setActiveSet)
      .finally(() => {
        creatingRef.current = false
      })
  }, [phase, currentSetIndex, activeSet, totalSets, config, repos, band])

  const onSetComplete = useCallback(
    (finishedTrainingSetId: string) => {
      void (async () => {
        const efforts = await repos.efforts.listBySet(finishedTrainingSetId)
        const newAttempts: AttemptResult[] = efforts
          .filter((e) => e.status === 'completed' && e.peakForceSmoothedKg !== null)
          .map((e) => ({
            hand: e.hand,
            effortId: e.id,
            peakForceSmoothedKg: e.peakForceSmoothedKg as number,
            smoothingWindowMs: e.smoothingWindowMs as number,
          }))
        setAttempts((prev) => [...prev, ...newAttempts])
        setActiveSet(null)
        setCurrentSetIndex((i) => i + 1)
      })()
    },
    [repos],
  )

  const isComplete = phase === 'running' && activeSet === null && currentSetIndex >= totalSets
  const effectivePhase: StepRunnerPhase = isComplete ? 'complete' : phase
  const result = isComplete ? selectBestAttempt(attempts) : null

  return {
    phase: effectivePhase,
    activeSet,
    onSetComplete,
    currentSetIndex,
    totalSets,
    result,
  }
}

/** Creates the TrainingSet DB row for one attempt/set and its matching SetPlan. */
async function createNextTrainingSet(
  config: StepRunnerConfig,
  setIndex: number,
  band: Band | null,
  repos: Repositories,
): Promise<ActiveSet> {
  const step = config.step
  const trainingSet = await repos.trainingSets.create({
    sessionId: config.sessionId,
    exerciseId: step.exerciseId,
    kind: step.kind,
    ordinal: config.stepIndex * 1000 + setIndex,
    sourceMaxEffortId: null,
    targetPercent: step.kind === 'target_band' ? step.targetPercent : null,
    targetForceKg: step.kind === 'target_band' ? (band?.targetKg ?? null) : null,
    toleranceBandKg: step.kind === 'target_band' ? step.toleranceKg : null,
    plannedWorkMs: step.kind === 'target_band' ? step.workDurationMs : step.pullDurationMs,
    repWorkMs: null,
    repRestMs: null,
    repCount: null,
    interHandRestMs: step.kind === 'target_band' ? step.interHandRestMs : 5000,
    interSetRestMs: step.kind === 'target_band' ? step.interSetRestMs : step.restBetweenAttemptsMs,
  })

  const setPlan: SetPlan =
    step.kind === 'max_effort'
      ? {
          setCount: 1,
          hands: ['left', 'right'],
          workDurationMs: step.pullDurationMs,
          countdownMs: 3000,
          interHandRestMs: 5000,
          interSetRestMs: step.restBetweenAttemptsMs,
          autoStartThresholdKg: 5,
        }
      : {
          setCount: 1,
          hands: ['left', 'right'],
          workDurationMs: step.workDurationMs,
          countdownMs: 3000,
          interHandRestMs: step.interHandRestMs,
          interSetRestMs: step.interSetRestMs,
          autoStartThresholdKg: 5,
        }

  return {
    trainingSetId: trainingSet.id,
    setPlan,
    band: step.kind === 'target_band' ? band : null,
  }
}
