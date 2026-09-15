import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { useRepositories } from '../../src/services/db/useRepositories'
import type { Exercise, MaxRecord } from '../../src/core/types'
import { colors, spacing, typography } from '../../src/theme/tokens'

/**
 * Exercise detail — current maxes per hand and basic exercise metadata.
 * Full history/progress charts for an exercise are Phase 6
 * ([08-roadmap.md](../../docs/08-roadmap.md)); this is the minimum needed
 * so Session setup has somewhere to link "view exercise" from.
 */
export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const repos = useRepositories()
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [leftMax, setLeftMax] = useState<MaxRecord | null>(null)
  const [rightMax, setRightMax] = useState<MaxRecord | null>(null)

  useEffect(() => {
    if (!repos || !id) return
    repos.exercises.getById(id).then(setExercise)
    repos.maxRecords.getLatest(id, 'left').then(setLeftMax)
    repos.maxRecords.getLatest(id, 'right').then(setRightMax)
  }, [repos, id])

  if (!exercise) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Loading…</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>{exercise.name}</Text>
      <Text style={styles.subtitle}>
        {exercise.gripType} · {exercise.edgeDepthMm}mm · {exercise.modality.replace('_', ' ')}
      </Text>

      <View style={styles.maxRow}>
        <MaxCard label="LEFT" max={leftMax} color={colors.handLeft} />
        <MaxCard label="RIGHT" max={rightMax} color={colors.handRight} />
      </View>
    </SafeAreaView>
  )
}

function MaxCard({ label, max, color }: { label: string; max: MaxRecord | null; color: string }) {
  return (
    <View style={styles.maxCard}>
      <Text style={[styles.maxLabel, { color }]}>{label}</Text>
      <Text style={styles.maxValue}>{max ? `${max.forceKg.toFixed(1)} kg` : '—'}</Text>
      {max && <Text style={styles.maxDate}>{new Date(max.recordedAt).toLocaleDateString()}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  loading: { ...typography.body, color: colors.textSecondary } as any,
  title: { ...typography.title, color: colors.textPrimary } as any,
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs } as any,
  maxRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  maxCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    alignItems: 'center',
  },
  maxLabel: { ...typography.label } as any,
  maxValue: { ...typography.metricLarge, color: colors.textPrimary, marginTop: spacing.sm } as any,
  maxDate: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs } as any,
})
