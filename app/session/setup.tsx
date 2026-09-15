import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useRepositories } from '../../src/services/db/useRepositories'
import type { Exercise } from '../../src/core/types'
import type { SessionStep } from '../../src/core/session/sessionPlan'
import { maxEffortDefault, targetBandDefault } from '../../src/core/protocol/presets'
import { colors, spacing, typography } from '../../src/theme/tokens'

/**
 * Session setup — see docs/04-screens-and-ux.md "Data entry" and
 * docs/03's core loop. Builds an ordered SessionPlan of steps (max-effort
 * tests, target-band training) that the live session runs one after
 * another; a target-band step can prescribe off a max-effort step earlier
 * in THIS plan (the "test then train in one workout" flow) or off the
 * latest previously-recorded max.
 *
 * Repeaters are a defined preset (docs/03) but not yet wired into
 * SessionStep/the live runner — scoped out of Phase 5, not silently
 * dropped; docs/08-roadmap.md tracks it.
 */
export default function SessionSetupScreen() {
  const router = useRouter()
  const repos = useRepositories()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const [steps, setSteps] = useState<SessionStep[]>([])
  const [bodyweightKg, setBodyweightKg] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!repos) return
      const list = await repos.exercises.listAll()
      if (cancelled) return
      setExercises(list)
      if (list.length > 0) setSelectedExerciseId(list[0].id)
      const lastSession = (await repos.sessions.listRecent(1))[0]
      if (lastSession && !cancelled) setBodyweightKg(String(lastSession.bodyweightKg))
    })()
    return () => {
      cancelled = true
    }
  }, [repos])

  function addMaxEffortStep() {
    if (!selectedExerciseId) return
    setSteps((prev) => [
      ...prev,
      {
        kind: 'max_effort',
        exerciseId: selectedExerciseId,
        attempts: maxEffortDefault.attemptsPerHand,
        pullDurationMs: maxEffortDefault.pullDurationMs,
        restBetweenAttemptsMs: maxEffortDefault.restBetweenAttemptsMs,
        smoothingWindowMs: 1000,
      },
    ])
  }

  function addTargetBandStep(sourceStepIndex: number | null) {
    if (!selectedExerciseId) return
    setSteps((prev) => [
      ...prev,
      {
        kind: 'target_band',
        exerciseId: selectedExerciseId,
        maxSource:
          sourceStepIndex === null
            ? { kind: 'latest_max' }
            : { kind: 'session_step', stepIndex: sourceStepIndex },
        targetPercent: targetBandDefault.targetPercent,
        toleranceKg: targetBandDefault.toleranceKg,
        workDurationMs: targetBandDefault.workDurationMs,
        interHandRestMs: targetBandDefault.interHandRestMs,
        interSetRestMs: targetBandDefault.interSetRestMs,
        setCount: targetBandDefault.setCount,
      },
    ])
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index))
  }

  async function startSession() {
    if (!repos || steps.length === 0) return
    const bw = Number(bodyweightKg)
    if (!Number.isFinite(bw) || bw <= 0) return

    const session = await repos.sessions.start({ bodyweightKg: bw })
    const plan = await repos.sessionPlans.create(session.id, JSON.stringify(steps))
    router.push({ pathname: '/session/live', params: { sessionId: session.id, planId: plan.id } })
  }

  const selectedExercise = exercises.find((e) => e.id === selectedExerciseId) ?? null
  const maxEffortStepIndices = steps
    .map((s, i) => (s.kind === 'max_effort' ? i : null))
    .filter((i): i is number => i !== null)

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>New session</Text>

        <Text style={styles.label}>Bodyweight (kg)</Text>
        <TextInput
          style={styles.input}
          value={bodyweightKg}
          onChangeText={setBodyweightKg}
          keyboardType="numeric"
          placeholder="e.g. 75"
          placeholderTextColor={colors.textTertiary}
        />

        <Text style={styles.label}>Exercise</Text>
        {exercises.length === 0 ? (
          <TouchableOpacity onPress={() => router.push('/exercise')}>
            <Text style={styles.linkText}>No exercises yet — create one first →</Text>
          </TouchableOpacity>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {exercises.map((ex) => (
              <TouchableOpacity
                key={ex.id}
                style={[styles.pill, selectedExerciseId === ex.id && styles.pillActive]}
                onPress={() => setSelectedExerciseId(ex.id)}
              >
                <Text style={styles.pillText}>{ex.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {selectedExercise && (
          <>
            <Text style={styles.label}>Add a step</Text>
            <View style={styles.stepButtonsRow}>
              <TouchableOpacity style={styles.stepButton} onPress={addMaxEffortStep}>
                <Text style={styles.stepButtonText}>Max-effort test</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stepButton} onPress={() => addTargetBandStep(null)}>
                <Text style={styles.stepButtonText}>Target-band (latest max)</Text>
              </TouchableOpacity>
            </View>
            {maxEffortStepIndices.length > 0 && (
              <View style={styles.stepButtonsRow}>
                {maxEffortStepIndices.map((i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.stepButton}
                    onPress={() => addTargetBandStep(i)}
                  >
                    <Text style={styles.stepButtonText}>Target-band (from step {i + 1})</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        <Text style={styles.label}>Steps ({steps.length})</Text>
        {steps.length === 0 ? (
          <Text style={styles.emptyText}>Add at least one step to start.</Text>
        ) : (
          steps.map((step, i) => (
            <StepCard
              key={i}
              step={step}
              index={i}
              exerciseName={exercises.find((e) => e.id === step.exerciseId)?.name ?? '?'}
              onRemove={() => removeStep(i)}
            />
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.startButton, steps.length === 0 && styles.startButtonDisabled]}
        onPress={startSession}
        disabled={steps.length === 0}
      >
        <Text style={styles.startButtonText}>Start session</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

function StepCard({
  step,
  index,
  exerciseName,
  onRemove,
}: {
  step: SessionStep
  index: number
  exerciseName: string
  onRemove: () => void
}) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepCardHeader}>
        <Text style={styles.stepCardTitle}>
          {index + 1}. {step.kind === 'max_effort' ? 'Max-effort test' : 'Target-band training'}
        </Text>
        <TouchableOpacity onPress={onRemove}>
          <Text style={styles.removeText}>Remove</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.stepCardDetail}>{exerciseName}</Text>
      {step.kind === 'max_effort' ? (
        <Text style={styles.stepCardDetail}>
          {step.attempts} attempts × {(step.pullDurationMs / 1000).toFixed(0)}s, both hands
        </Text>
      ) : (
        <Text style={styles.stepCardDetail}>
          {step.setCount} sets @ {step.targetPercent}% ± {step.toleranceKg}kg, both hands
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md } as any,
  label: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  } as any,
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  } as any,
  linkText: { ...typography.body, color: colors.accent } as any,
  pill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { ...typography.body, color: colors.textSecondary } as any,
  stepButtonsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stepButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  stepButtonText: { ...typography.caption, color: colors.accent } as any,
  emptyText: { ...typography.body, color: colors.textTertiary } as any,
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  stepCardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  stepCardTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' } as any,
  removeText: { ...typography.caption, color: colors.danger } as any,
  stepCardDetail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 } as any,
  startButton: {
    margin: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  startButtonDisabled: { opacity: 0.4 },
  startButtonText: { ...typography.body, color: colors.bg, fontWeight: '700' } as any,
})
