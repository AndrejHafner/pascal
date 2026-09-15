import { useCallback, useState } from 'react'
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { useRepositories } from '../../src/services/db/useRepositories'
import type { SessionSummaryRow } from '../../src/services/db/repositories/sessionRepository'
import { colors, spacing, typography } from '../../src/theme/tokens'

/**
 * History — reverse-chronological session list, grouped by month. See
 * docs/04-screens-and-ux.md "History & Session detail": "each row shows
 * date, exercise(s), set count, headline number (max or total TUT)."
 */
export default function HistoryScreen() {
  const router = useRouter()
  const repos = useRepositories()
  const [summaries, setSummaries] = useState<SessionSummaryRow[] | null>(null)

  const reload = useCallback(async () => {
    if (!repos) return
    setSummaries(await repos.sessions.listWithSummary())
  }, [repos])

  useFocusEffect(
    useCallback(() => {
      void reload()
    }, [reload]),
  )

  if (summaries === null) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Text style={styles.title}>History</Text>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    )
  }

  if (summaries.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Text style={styles.title}>History</Text>
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyText}>No sessions yet.</Text>
          <Text style={styles.emptySubtext}>Sessions you complete will show up here.</Text>
        </View>
      </SafeAreaView>
    )
  }

  const sections = groupByMonth(summaries)

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>History</Text>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.session.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <SessionRow
            row={item}
            onPress={() =>
              router.push({
                pathname: '/history/[sessionId]',
                params: { sessionId: item.session.id },
              })
            }
          />
        )}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  )
}

function groupByMonth(
  summaries: SessionSummaryRow[],
): { title: string; data: SessionSummaryRow[] }[] {
  const sections: { title: string; data: SessionSummaryRow[] }[] = []
  let currentTitle: string | null = null
  let currentData: SessionSummaryRow[] = []

  for (const row of summaries) {
    const title = new Date(row.session.startedAt).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })
    if (title !== currentTitle) {
      if (currentTitle !== null) sections.push({ title: currentTitle, data: currentData })
      currentTitle = title
      currentData = []
    }
    currentData.push(row)
  }
  if (currentTitle !== null) sections.push({ title: currentTitle, data: currentData })
  return sections
}

function SessionRow({ row, onPress }: { row: SessionSummaryRow; onPress: () => void }) {
  const { session, exerciseNames, setCount, headlinePeakForceKg, totalTutMs } = row
  const date = new Date(session.startedAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const wasAborted = session.endedAt === null

  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.rowMain}>
        <Text style={styles.rowDate}>{date}</Text>
        <Text style={styles.rowExercises} numberOfLines={1}>
          {exerciseNames.length > 0 ? exerciseNames.join(', ') : 'No exercises'}
        </Text>
        <Text style={styles.rowSetCount}>
          {setCount} set{setCount === 1 ? '' : 's'}
          {wasAborted ? ' · unfinished' : ''}
        </Text>
      </View>
      <View style={styles.rowHeadline}>
        {headlinePeakForceKg !== null ? (
          <>
            <Text style={styles.headlineValue}>{headlinePeakForceKg.toFixed(1)}</Text>
            <Text style={styles.headlineUnit}>kg max</Text>
          </>
        ) : (
          <>
            <Text style={styles.headlineValue}>{(totalTutMs / 1000).toFixed(0)}</Text>
            <Text style={styles.headlineUnit}>s TUT</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  title: { ...typography.title, color: colors.textPrimary, marginTop: spacing.md } as any,
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xl } as any,
  emptyBlock: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  emptyText: { ...typography.body, color: colors.textSecondary } as any,
  emptySubtext: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  } as any,
  listContent: { paddingBottom: spacing.xxxl },
  sectionHeader: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  } as any,
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowMain: { flex: 1, marginRight: spacing.md },
  rowDate: { ...typography.body, color: colors.textPrimary, fontWeight: '600' } as any,
  rowExercises: { ...typography.caption, color: colors.textSecondary, marginTop: 2 } as any,
  rowSetCount: { ...typography.caption, color: colors.textTertiary, marginTop: 2 } as any,
  rowHeadline: { alignItems: 'flex-end' },
  headlineValue: { ...typography.metricMedium, color: colors.textPrimary } as any,
  headlineUnit: { ...typography.caption, color: colors.textTertiary } as any,
})
