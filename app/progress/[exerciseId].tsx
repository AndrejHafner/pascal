import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { useRepositories } from '../../src/services/db/useRepositories'
import type { Exercise, MaxRecord } from '../../src/core/types'
import { toPercentBodyweight } from '../../src/core/progress/normalization'
import { pairForAsymmetryTrend } from '../../src/core/progress/asymmetryTrend'
import { aggregateWeeklyLoad } from '../../src/core/progress/trainingLoad'
import { DEFAULT_ASYMMETRY_THRESHOLD } from '../../src/core/metrics/asymmetry'
import { TrendChart } from '../../src/features/chart/TrendChart'
import type { TrendPoint } from '../../src/features/chart/trendGeometry'
import { colors, spacing, typography } from '../../src/theme/tokens'

/**
 * Per-exercise progress — see docs/04-screens-and-ux.md "Progress": max
 * progression per hand (kg <-> %BW toggle), asymmetry trend with threshold
 * reference line, training load (TUT + impulse) per week. Every chart uses
 * TrendChart, which itself handles the sparse-data case (docs/04/docs/05).
 */
export default function ExerciseProgressScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>()
  const repos = useRepositories()
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [leftMaxes, setLeftMaxes] = useState<MaxRecord[]>([])
  const [rightMaxes, setRightMaxes] = useState<MaxRecord[]>([])
  const [weeklyLoad, setWeeklyLoad] = useState<
    { weekStartMs: number; totalTutMs: number; totalImpulseKgS: number }[]
  >([])
  const [useBodyweightPercent, setUseBodyweightPercent] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!repos || !exerciseId) return
      const [exerciseRecord, left, right, efforts] = await Promise.all([
        repos.exercises.getById(exerciseId),
        repos.maxRecords.listByExerciseChronological(exerciseId, 'left'),
        repos.maxRecords.listByExerciseChronological(exerciseId, 'right'),
        repos.efforts.listCompletedForTrainingLoad(exerciseId),
      ])
      if (cancelled) return
      setExercise(exerciseRecord)
      setLeftMaxes(left)
      setRightMaxes(right)
      setWeeklyLoad(aggregateWeeklyLoad(efforts))
    })()
    return () => {
      cancelled = true
    }
  }, [repos, exerciseId])

  if (!exercise) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    )
  }

  const leftPoints: TrendPoint[] = leftMaxes.map((m) => ({
    timestampMs: m.recordedAt,
    value: useBodyweightPercent ? toPercentBodyweight(m.forceKg, m.bodyweightKgAtTest) : m.forceKg,
  }))
  const rightPoints: TrendPoint[] = rightMaxes.map((m) => ({
    timestampMs: m.recordedAt,
    value: useBodyweightPercent ? toPercentBodyweight(m.forceKg, m.bodyweightKgAtTest) : m.forceKg,
  }))

  const asymmetryPoints = pairForAsymmetryTrend(
    leftMaxes.map((m) => ({ forceKg: m.forceKg, recordedAt: m.recordedAt })),
    rightMaxes.map((m) => ({ forceKg: m.forceKg, recordedAt: m.recordedAt })),
  )
  const asymmetryTrendPoints: TrendPoint[] = asymmetryPoints.map((p) => ({
    timestampMs: p.timestampMs,
    value: p.asymmetry.percentDiff * 100,
  }))

  const tutPoints: TrendPoint[] = weeklyLoad.map((w) => ({
    timestampMs: w.weekStartMs,
    value: w.totalTutMs / 1000,
  }))
  const impulsePoints: TrendPoint[] = weeklyLoad.map((w) => ({
    timestampMs: w.weekStartMs,
    value: w.totalImpulseKgS,
  }))

  const valueUnit = useBodyweightPercent ? '%' : 'kg'
  const valueFormatter = (v: number) => `${v.toFixed(1)}${valueUnit}`

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{exercise.name}</Text>
        <Text style={styles.subtitle}>
          {exercise.gripType} · {exercise.edgeDepthMm}mm
        </Text>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Max progression</Text>
          <TouchableOpacity
            style={styles.toggle}
            onPress={() => setUseBodyweightPercent((v) => !v)}
          >
            <Text style={styles.toggleText}>{useBodyweightPercent ? '%BW' : 'kg'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.chartCaption}>Left</Text>
        <TrendChart
          points={leftPoints}
          color={colors.handLeft}
          formatValue={valueFormatter}
          emptyLabel="No left-hand max recorded yet"
        />
        <Text style={[styles.chartCaption, { marginTop: spacing.md }]}>Right</Text>
        <TrendChart
          points={rightPoints}
          color={colors.handRight}
          formatValue={valueFormatter}
          emptyLabel="No right-hand max recorded yet"
        />

        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Asymmetry trend</Text>
        <Text style={styles.helperText}>
          Difference between hands as a % of the stronger side. The threshold below is a heuristic
          (5% default), not an evidence-based cutoff — shown as a reference, not an alarm.
        </Text>
        <TrendChart
          points={asymmetryTrendPoints}
          color={colors.textPrimary}
          referenceValue={DEFAULT_ASYMMETRY_THRESHOLD * 100}
          referenceLabel="threshold"
          formatValue={(v) => `${v.toFixed(0)}%`}
          emptyLabel="Needs a max test on both hands to compare"
        />

        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>
          Training load — time under tension
        </Text>
        <Text style={styles.helperText}>Total seconds under tension, per week.</Text>
        <TrendChart
          points={tutPoints}
          color={colors.accent}
          formatValue={(v) => `${v.toFixed(0)}s`}
          emptyLabel="No completed sets yet"
        />

        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>
          Training load — impulse
        </Text>
        <Text style={styles.helperText}>Total ∫force·dt (kg·s), per week.</Text>
        <TrendChart
          points={impulsePoints}
          color={colors.accent}
          formatValue={(v) => `${v.toFixed(0)} kg·s`}
          emptyLabel="No completed sets yet"
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    padding: spacing.lg,
  } as any,
  title: { ...typography.title, color: colors.textPrimary } as any,
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs } as any,
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  sectionLabel: { ...typography.label, color: colors.textTertiary } as any,
  toggle: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleText: { ...typography.caption, color: colors.accent, fontWeight: '600' } as any,
  chartCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  } as any,
  helperText: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  } as any,
})
