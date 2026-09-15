import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { useRepositories } from '../../../src/services/db/useRepositories'
import type { Effort, Exercise, Sample, TrainingSet } from '../../../src/core/types'
import type { Band } from '../../../src/core/metrics/band'
import { ForceChart } from '../../../src/features/chart/ForceChart'
import { formatSeconds } from '../../../src/features/session/formatDuration'
import { colors, spacing, typography } from '../../../src/theme/tokens'

/**
 * Set detail — see docs/04-screens-and-ux.md "Session detail": "tap a set
 * to see both hands' force curves overlaid (left/right in distinct
 * colors, with the band overlaid) — reusing the same chart component as
 * the live screen, so a past set looks exactly like it did live." Aborted
 * / disconnected efforts are shown with their reason, not hidden.
 */
export default function SetDetailScreen() {
  const { trainingSetId } = useLocalSearchParams<{ trainingSetId: string }>()
  const repos = useRepositories()
  const [set, setSet] = useState<TrainingSet | null>(null)
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [leftEffort, setLeftEffort] = useState<Effort | null>(null)
  const [rightEffort, setRightEffort] = useState<Effort | null>(null)
  const [leftSamples, setLeftSamples] = useState<Sample[]>([])
  const [rightSamples, setRightSamples] = useState<Sample[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!repos || !trainingSetId) return
      const setRecord = await repos.trainingSets.getById(trainingSetId)
      if (cancelled || !setRecord) return
      setSet(setRecord)

      const [exerciseRecord, efforts] = await Promise.all([
        repos.exercises.getById(setRecord.exerciseId),
        repos.efforts.listBySet(setRecord.id),
      ])
      if (cancelled) return
      setExercise(exerciseRecord)
      const left = efforts.find((e) => e.hand === 'left') ?? null
      const right = efforts.find((e) => e.hand === 'right') ?? null
      setLeftEffort(left)
      setRightEffort(right)

      const [leftS, rightS] = await Promise.all([
        left ? repos.samples.listByEffort(left.id) : Promise.resolve([]),
        right ? repos.samples.listByEffort(right.id) : Promise.resolve([]),
      ])
      if (!cancelled) {
        setLeftSamples(leftS)
        setRightSamples(rightS)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [repos, trainingSetId])

  if (!set) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    )
  }

  const band: Band | null =
    set.kind === 'target_band' && set.targetForceKg !== null && set.toleranceBandKg !== null
      ? { targetKg: set.targetForceKg, toleranceKg: set.toleranceBandKg }
      : null

  const hasAnySamples = leftSamples.length > 0 || rightSamples.length > 0

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{exercise?.name ?? 'Set'}</Text>
        <Text style={styles.subtitle}>{formatKind(set.kind)}</Text>

        {hasAnySamples ? (
          <View style={styles.chartContainer}>
            <ForceChart
              historicalSamples={leftSamples.map((s) => ({
                offsetMs: s.offsetMs,
                forceKg: s.forceKg,
              }))}
              secondaryHistoricalSamples={rightSamples.map((s) => ({
                offsetMs: s.offsetMs,
                forceKg: s.forceKg,
              }))}
              secondaryColor={colors.handRight}
              band={band}
            />
            <View style={styles.legendRow}>
              <LegendDot color={colors.handLeft} label="Left" />
              <LegendDot color={colors.handRight} label="Right" />
            </View>
          </View>
        ) : (
          <View style={styles.noDataBlock}>
            <Text style={styles.noDataText}>No force curve recorded for this set.</Text>
          </View>
        )}

        <View style={styles.handStatsRow}>
          <HandStats label="LEFT" color={colors.handLeft} effort={leftEffort} />
          <HandStats label="RIGHT" color={colors.handRight} effort={rightEffort} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function HandStats({
  label,
  color,
  effort,
}: {
  label: string
  color: string
  effort: Effort | null
}) {
  if (!effort) {
    return (
      <View style={styles.handStatsCard}>
        <Text style={[styles.handStatsLabel, { color }]}>{label}</Text>
        <Text style={styles.handStatsEmpty}>Not recorded</Text>
      </View>
    )
  }

  if (effort.status !== 'completed') {
    return (
      <View style={styles.handStatsCard}>
        <Text style={[styles.handStatsLabel, { color }]}>{label}</Text>
        <Text style={styles.handStatsIssue}>{describeStatus(effort.status)}</Text>
      </View>
    )
  }

  return (
    <View style={styles.handStatsCard}>
      <Text style={[styles.handStatsLabel, { color }]}>{label}</Text>
      <Text style={styles.handStatsValue}>
        {effort.peakForceSmoothedKg != null ? `${effort.peakForceSmoothedKg.toFixed(1)} kg` : '—'}
      </Text>
      <Text style={styles.handStatsCaption}>peak</Text>
      {effort.timeUnderTensionMs != null && (
        <Text style={styles.handStatsDetail}>TUT {formatSeconds(effort.timeUnderTensionMs)}</Text>
      )}
      {effort.impulseKgS != null && (
        <Text style={styles.handStatsDetail}>{effort.impulseKgS.toFixed(0)} kg·s impulse</Text>
      )}
    </View>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  )
}

function describeStatus(status: Effort['status']): string {
  if (status === 'aborted') return 'Aborted'
  if (status === 'disconnected') return 'Device disconnected'
  return status
}

function formatKind(kind: TrainingSet['kind']): string {
  if (kind === 'max_effort') return 'Max effort test'
  if (kind === 'target_band') return 'Target-band training'
  return 'All out'
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
  chartContainer: { marginTop: spacing.lg, height: 220 },
  legendRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { ...typography.caption, color: colors.textSecondary } as any,
  noDataBlock: {
    marginTop: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: 12,
    alignItems: 'center',
  },
  noDataText: { ...typography.body, color: colors.textTertiary } as any,
  handStatsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  handStatsCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
  },
  handStatsLabel: { ...typography.label } as any,
  handStatsValue: {
    ...typography.metricLarge,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  } as any,
  handStatsCaption: { ...typography.caption, color: colors.textTertiary } as any,
  handStatsDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  } as any,
  handStatsEmpty: { ...typography.body, color: colors.textTertiary, marginTop: spacing.sm } as any,
  handStatsIssue: { ...typography.body, color: colors.warning, marginTop: spacing.sm } as any,
})
