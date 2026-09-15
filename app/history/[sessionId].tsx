import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRepositories } from '../../src/services/db/useRepositories'
import type { Effort, Exercise, Session, TrainingSet } from '../../src/core/types'
import { colors, spacing, typography } from '../../src/theme/tokens'

interface SetRow {
  set: TrainingSet
  exercise: Exercise | null
  leftEffort: Effort | null
  rightEffort: Effort | null
}

/**
 * Session detail — see docs/04-screens-and-ux.md "History & Session
 * detail": "session metadata -> list of sets -> tap a set to see both
 * hands' force curves overlaid." Any set can be viewed, including
 * aborted/disconnected ones, clearly marked with the reason.
 */
export default function SessionDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const router = useRouter()
  const repos = useRepositories()
  const [session, setSession] = useState<Session | null>(null)
  const [rows, setRows] = useState<SetRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!repos || !sessionId) return
      const [sessionRecord, sets] = await Promise.all([
        repos.sessions.getById(sessionId),
        repos.trainingSets.listBySession(sessionId),
      ])
      if (cancelled) return
      setSession(sessionRecord)

      const built: SetRow[] = await Promise.all(
        sets.map(async (set) => {
          const [exercise, efforts] = await Promise.all([
            repos.exercises.getById(set.exerciseId),
            repos.efforts.listBySet(set.id),
          ])
          return {
            set,
            exercise,
            leftEffort: efforts.find((e) => e.hand === 'left') ?? null,
            rightEffort: efforts.find((e) => e.hand === 'right') ?? null,
          }
        }),
      )
      if (!cancelled) setRows(built)
    })()
    return () => {
      cancelled = true
    }
  }, [repos, sessionId])

  if (!session || !rows) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    )
  }

  const dateLabel = new Date(session.startedAt).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const durationLabel = session.endedAt
    ? formatDuration(session.endedAt - session.startedAt)
    : 'unfinished'

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{dateLabel}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{durationLabel}</Text>
          <Text style={styles.metaText}>{session.bodyweightKg}kg bodyweight</Text>
        </View>
        {session.notes && <Text style={styles.notes}>{session.notes}</Text>}

        <Text style={styles.label}>Sets ({rows.length})</Text>
        {rows.length === 0 ? (
          <Text style={styles.emptyText}>No sets recorded.</Text>
        ) : (
          rows.map((row, i) => (
            <SetRowCard
              key={row.set.id}
              row={row}
              index={i}
              onPress={() =>
                router.push({
                  pathname: '/history/set/[trainingSetId]',
                  params: { trainingSetId: row.set.id },
                })
              }
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function SetRowCard({ row, index, onPress }: { row: SetRow; index: number; onPress: () => void }) {
  const { set, exercise, leftEffort, rightEffort } = row
  return (
    <TouchableOpacity style={styles.setCard} onPress={onPress}>
      <View style={styles.setCardHeader}>
        <Text style={styles.setCardTitle}>
          {index + 1}. {exercise?.name ?? 'Unknown exercise'}
        </Text>
        <Text style={styles.setCardKind}>{formatKind(set.kind)}</Text>
      </View>
      <View style={styles.setCardHands}>
        <HandBadge label="L" effort={leftEffort} color={colors.handLeft} />
        <HandBadge label="R" effort={rightEffort} color={colors.handRight} />
      </View>
    </TouchableOpacity>
  )
}

function HandBadge({
  label,
  effort,
  color,
}: {
  label: string
  effort: Effort | null
  color: string
}) {
  if (!effort) {
    return (
      <View style={styles.handBadge}>
        <Text style={[styles.handBadgeLabel, { color }]}>{label}</Text>
        <Text style={styles.handBadgeValue}>—</Text>
      </View>
    )
  }
  const isProblem = effort.status !== 'completed'
  return (
    <View style={styles.handBadge}>
      <Text style={[styles.handBadgeLabel, { color }]}>{label}</Text>
      {isProblem ? (
        <Text style={styles.handBadgeIssue}>{effort.status}</Text>
      ) : (
        <Text style={styles.handBadgeValue}>
          {effort.peakForceSmoothedKg != null ? `${effort.peakForceSmoothedKg.toFixed(1)}kg` : '—'}
        </Text>
      )}
    </View>
  )
}

function formatKind(kind: TrainingSet['kind']): string {
  if (kind === 'max_effort') return 'Max effort'
  if (kind === 'target_band') return 'Target band'
  return 'All out'
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes}m`
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
  metaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  metaText: { ...typography.caption, color: colors.textSecondary } as any,
  notes: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    fontStyle: 'italic',
  } as any,
  label: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  } as any,
  emptyText: { ...typography.body, color: colors.textTertiary } as any,
  setCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  setCardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  setCardTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' } as any,
  setCardKind: { ...typography.caption, color: colors.textTertiary } as any,
  setCardHands: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  handBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  handBadgeLabel: { ...typography.label } as any,
  handBadgeValue: { ...typography.body, color: colors.textPrimary } as any,
  handBadgeIssue: { ...typography.caption, color: colors.warning } as any,
})
