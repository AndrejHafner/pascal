import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useKeepAwake } from 'expo-keep-awake'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { BleManager } from 'react-native-ble-plx'
import { useStepRunner } from '../../src/features/session/useStepRunner'
import type { StepResult } from '../../src/core/session/planPrescription'
import { LiveSetRunner } from '../../src/features/session/LiveSetRunner'
import { SetSummary } from '../../src/features/session/SetSummary'
import { SessionSummary } from '../../src/features/session/SessionSummary'
import { createDeviceSource } from '../../src/services/ble/createDeviceSource'
import { CuePlayer } from '../../src/services/cues/CuePlayer'
import { expoHapticsAdapter } from '../../src/services/cues/HapticsAdapter'
import { useRepositories } from '../../src/services/db/useRepositories'
import type { Repositories } from '../../src/services/db/repositories'
import type { SessionStep } from '../../src/core/session/sessionPlan'
import type { Effort, Hand } from '../../src/core/types'
import { colors, spacing, typography } from '../../src/theme/tokens'

/**
 * Live session — the multi-step orchestrator. Drives a persisted
 * SessionPlan (docs/08-roadmap.md Phase 5) step by step: each step
 * expands to one or more TrainingSets via useStepRunner, each set runs
 * through the full live UI via LiveSetRunner, and a Set summary shows
 * between sets (docs/04 "used productively during rest"). When the last
 * step finishes, Session summary lets the user save.
 *
 * Route params: sessionId, planId (from Session setup, which persists the
 * plan before navigating here — see docs/04's "resume unfinished session":
 * the plan surviving in SQLite is what makes resuming possible if the app
 * is killed mid-session, not just the route params).
 */
export default function LiveSessionScreen() {
  useKeepAwake()
  const router = useRouter()
  const params = useLocalSearchParams<{ sessionId: string; planId: string }>()
  const repos = useRepositories()

  const manager = useMemo(() => new BleManager(), [])
  useEffect(() => {
    return () => {
      manager.destroy()
    }
  }, [manager])
  const cues = useMemo(() => new CuePlayer(expoHapticsAdapter), [])

  const [steps, setSteps] = useState<SessionStep[] | null>(null)
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null)

  useEffect(() => {
    if (!repos || !params.planId) return
    let cancelled = false
    void (async () => {
      const plan = await repos.sessionPlans.getBySessionId(params.sessionId)
      if (cancelled || !plan) return
      setSteps(JSON.parse(plan.stepsJson) as SessionStep[])
      setSavedPlanId(plan.id)
    })()
    return () => {
      cancelled = true
    }
  }, [repos, params.planId, params.sessionId])

  if (!repos || !steps) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    )
  }

  return (
    <PlanRunner
      sessionId={params.sessionId}
      planId={savedPlanId!}
      steps={steps}
      repos={repos}
      manager={manager}
      cues={cues}
      onFinished={() => router.replace('/')}
    />
  )
}

type PlanPhase = 'running_step' | 'set_summary' | 'session_summary'

function PlanRunner({
  sessionId,
  planId,
  steps,
  repos,
  manager,
  cues,
  onFinished,
}: {
  sessionId: string
  planId: string
  steps: SessionStep[]
  repos: Repositories
  manager: BleManager
  cues: CuePlayer
  onFinished: () => void
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [phase, setPhase] = useState<PlanPhase>('running_step')
  const [stepResults, setStepResults] = useState<StepResult[]>([])
  const [lastSetEfforts, setLastSetEfforts] = useState<{
    left: Effort | null
    right: Effort | null
  }>({
    left: null,
    right: null,
  })

  const currentStep = steps[stepIndex]

  const device = useMemo(
    () =>
      createDeviceSource(manager, {
        kind: 'emulator',
        sequenceId: currentStep?.kind === 'target_band' ? 'steady-pull' : 'noisy-pull',
      }),
    [manager, currentStep],
  )
  const connectedRef = useRef<string | null>(null)
  useEffect(() => {
    const key = `${stepIndex}`
    if (connectedRef.current === key) return
    connectedRef.current = key
    device.connect()
    return () => {
      device.disconnect()
    }
  }, [device, stepIndex])

  const stepRunner = useStepRunner(
    { sessionId, step: currentStep, stepIndex, priorStepResults: stepResults },
    repos,
  )

  // Once a step completes, persist a MaxRecord for max-effort steps,
  // record the StepResult for downstream session_step prescriptions, and
  // advance — or move to session summary if this was the last step.
  const advancedForStepRef = useRef<number | null>(null)
  useEffect(() => {
    if (stepRunner.phase !== 'complete' || advancedForStepRef.current === stepIndex) return
    advancedForStepRef.current = stepIndex

    void (async () => {
      const result = stepRunner.result ?? {}
      if (currentStep.kind === 'max_effort') {
        await persistMaxRecords(
          repos,
          sessionId,
          currentStep.exerciseId,
          result,
          currentStep.smoothingWindowMs,
        )
      }
      // StepResult.bestByHand is typed as MaxRecordLike (forceKg +
      // recordedAt) for planPrescription.ts's sake, but selectBestAttempt's
      // output has no timestamp — it was just recorded, so stamp it now.
      const recordedAt = Date.now()
      const bestByHand: StepResult['bestByHand'] = {}
      for (const hand of ['left', 'right'] as Hand[]) {
        const best = result[hand]
        if (best) bestByHand[hand] = { forceKg: best.forceKg, recordedAt }
      }
      setStepResults((prev) => [...prev, { stepIndex, bestByHand }])

      const nextIndex = stepIndex + 1
      await repos.sessionPlans.updateCurrentStep(planId, nextIndex)
      if (nextIndex >= steps.length) {
        setPhase('session_summary')
      } else {
        setStepIndex(nextIndex)
        setPhase('running_step')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepRunner.phase, stepIndex])

  async function handleSetDone(trainingSetId: string) {
    const efforts = await repos.efforts.listBySet(trainingSetId)
    setLastSetEfforts({
      left: efforts.find((e) => e.hand === 'left') ?? null,
      right: efforts.find((e) => e.hand === 'right') ?? null,
    })
    stepRunner.onSetComplete(trainingSetId)
    setPhase('set_summary')
  }

  if (phase === 'session_summary') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <SessionSummary sessionId={sessionId} repos={repos} onSaved={onFinished} />
      </SafeAreaView>
    )
  }

  if (stepRunner.phase === 'blocked_no_max') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.centerFill}>
          <Text style={styles.blockedText}>
            No max on record for this exercise yet — run a max test first.
          </Text>
          <TouchableOpacity style={styles.abortButton} onPress={onFinished}>
            <Text style={styles.abortText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  if (phase === 'set_summary') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>
            Set {stepRunner.currentSetIndex}/{stepRunner.totalSets}
          </Text>
        </View>
        <SetSummary leftEffort={lastSetEfforts.left} rightEffort={lastSetEfforts.right} />
        <TouchableOpacity style={styles.continueButton} onPress={() => setPhase('running_step')}>
          <Text style={styles.continueButtonText}>
            {stepRunner.currentSetIndex >= stepRunner.totalSets ? 'Continue' : 'Next set'}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  if (!stepRunner.activeSet) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Preparing…</Text>
      </SafeAreaView>
    )
  }

  const setLabel =
    currentStep.kind === 'max_effort'
      ? `Attempt ${stepRunner.currentSetIndex + 1}/${stepRunner.totalSets}`
      : `Set ${stepRunner.currentSetIndex + 1}/${stepRunner.totalSets}`

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <LiveSetRunner
        key={stepRunner.activeSet.trainingSetId}
        config={{
          plan: stepRunner.activeSet.setPlan,
          band: stepRunner.activeSet.band,
          setId: stepRunner.activeSet.trainingSetId,
          deviceType: 'emulator',
          deviceSequence: currentStep.kind === 'target_band' ? 'steady-pull' : 'noisy-pull',
        }}
        deps={{
          device,
          cues,
          effortRepository: repos.efforts,
          sampleRepository: repos.samples,
        }}
        setLabel={setLabel}
        onDone={() => handleSetDone(stepRunner.activeSet!.trainingSetId)}
      />
    </SafeAreaView>
  )
}

async function persistMaxRecords(
  repos: Repositories,
  sessionId: string,
  exerciseId: string,
  result: Partial<Record<Hand, { effortId: string; forceKg: number; smoothingWindowMs: number }>>,
  smoothingWindowMs: number,
) {
  const session = await repos.sessions.getById(sessionId)
  const bodyweightKg = session?.bodyweightKg ?? 0

  for (const hand of ['left', 'right'] as Hand[]) {
    const best = result[hand]
    if (!best) continue
    await repos.maxRecords.create({
      exerciseId,
      hand,
      effortId: best.effortId,
      forceKg: best.forceKg,
      smoothingWindowMs: best.smoothingWindowMs ?? smoothingWindowMs,
      rule: 'best_attempt',
      bodyweightKgAtTest: bodyweightKg,
    })
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxxl,
  } as any,
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  blockedText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' } as any,
  abortButton: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  abortText: { ...typography.body, color: colors.danger } as any,
  summaryHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  summaryTitle: { ...typography.title, color: colors.textPrimary } as any,
  continueButton: {
    margin: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  continueButtonText: { ...typography.body, color: colors.bg, fontWeight: '700' } as any,
})
