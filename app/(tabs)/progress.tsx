import { useCallback, useState } from 'react'
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { useRepositories } from '../../src/services/db/useRepositories'
import type { Exercise } from '../../src/core/types'
import { colors, spacing, typography } from '../../src/theme/tokens'

/**
 * Progress — exercise picker. See docs/04-screens-and-ux.md "Progress":
 * "Progress -> per-exercise / per-hand detail." Per-exercise charts (max
 * progression, asymmetry trend, training load) live at
 * app/progress/[exerciseId].tsx.
 */
export default function ProgressScreen() {
  const router = useRouter()
  const repos = useRepositories()
  const [exercises, setExercises] = useState<Exercise[] | null>(null)

  const reload = useCallback(async () => {
    if (!repos) return
    setExercises(await repos.exercises.listAll())
  }, [repos])

  useFocusEffect(
    useCallback(() => {
      void reload()
    }, [reload]),
  )

  if (exercises === null) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Text style={styles.title}>Progress</Text>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    )
  }

  if (exercises.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Text style={styles.title}>Progress</Text>
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyText}>No exercises yet.</Text>
          <Text style={styles.emptySubtext}>
            Once you&rsquo;ve run a few sessions, progression charts show up here per exercise.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Progress</Text>
      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() =>
              router.push({ pathname: '/progress/[exerciseId]', params: { exerciseId: item.id } })
            }
          >
            <Text style={styles.rowTitle}>{item.name}</Text>
            <Text style={styles.rowSubtitle}>
              {item.gripType} · {item.edgeDepthMm}mm
            </Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
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
    textAlign: 'center',
  } as any,
  listContent: { paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' } as any,
  rowSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 } as any,
})
