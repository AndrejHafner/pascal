import { useCallback, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { useRepositories } from '../../src/services/db/useRepositories'
import type { Session } from '../../src/core/types'
import { colors, spacing, typography } from '../../src/theme/tokens'

/**
 * Today — entry point. See docs/04-screens-and-ux.md "Screen inventory"
 * and "Visual states / edge cases": "No sessions yet" shows a guided
 * first-run path; an unfinished session (app killed mid-workout) shows a
 * resume card rather than silently dropping it.
 */
export default function TodayScreen() {
  const router = useRouter()
  const repos = useRepositories()
  const [unfinished, setUnfinished] = useState<Session | null>(null)
  const [recent, setRecent] = useState<Session[]>([])
  const [hasExercises, setHasExercises] = useState<boolean | null>(null)

  const reload = useCallback(async () => {
    if (!repos) return
    const [unfinishedSession, recentSessions, exercises] = await Promise.all([
      repos.sessions.getUnfinished(),
      repos.sessions.listRecent(5),
      repos.exercises.listAll(),
    ])
    setUnfinished(unfinishedSession)
    setRecent(recentSessions)
    setHasExercises(exercises.length > 0)
  }, [repos])

  // useFocusEffect fires on initial mount as well as on every return to
  // this tab, so a separate mount-only effect calling reload() would be
  // redundant — this is the single source of "when to reload."
  useFocusEffect(
    useCallback(() => {
      void reload()
    }, [reload]),
  )

  async function resumeUnfinished() {
    if (!repos || !unfinished) return
    const plan = await repos.sessionPlans.getBySessionId(unfinished.id)
    if (!plan) return
    router.push({
      pathname: '/session/live',
      params: { sessionId: unfinished.id, planId: plan.id },
    })
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Today</Text>

      {unfinished && (
        <TouchableOpacity style={styles.resumeCard} onPress={resumeUnfinished}>
          <Text style={styles.resumeTitle}>Resume unfinished session</Text>
          <Text style={styles.resumeSubtitle}>
            Started {new Date(unfinished.startedAt).toLocaleString()}
          </Text>
        </TouchableOpacity>
      )}

      {hasExercises === false ? (
        <View style={styles.firstRun}>
          <Text style={styles.firstRunText}>
            Get started: connect your device, add an exercise, then run a max test.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/exercise')}>
            <Text style={styles.primaryButtonText}>Add an exercise</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/device')}>
            <Text style={styles.secondaryButtonText}>Connect device</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/session/setup')}
          >
            <Text style={styles.primaryButtonText}>Start session</Text>
          </TouchableOpacity>

          {recent.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Recent</Text>
              {recent.map((session) => (
                <View key={session.id} style={styles.recentRow}>
                  <Text style={styles.recentText}>
                    {new Date(session.startedAt).toLocaleDateString()}
                  </Text>
                  <Text style={styles.recentSubtext}>
                    {session.endedAt ? 'completed' : 'in progress'}
                  </Text>
                </View>
              ))}
            </>
          )}
        </>
      )}

      <TouchableOpacity style={styles.deviceLink} onPress={() => router.push('/device')}>
        <Text style={styles.deviceLinkText}>Device</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg } as any,
  resumeCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  resumeTitle: { ...typography.body, color: colors.accent, fontWeight: '600' } as any,
  resumeSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  } as any,
  firstRun: { gap: spacing.md },
  firstRunText: { ...typography.body, color: colors.textSecondary } as any,
  primaryButton: {
    paddingVertical: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  primaryButtonText: { ...typography.body, color: colors.bg, fontWeight: '700' } as any,
  secondaryButton: {
    paddingVertical: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryButtonText: { ...typography.body, color: colors.textSecondary } as any,
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  } as any,
  recentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recentText: { ...typography.body, color: colors.textPrimary } as any,
  recentSubtext: { ...typography.caption, color: colors.textTertiary } as any,
  deviceLink: { marginTop: 'auto', alignItems: 'center', paddingVertical: spacing.md },
  deviceLinkText: { ...typography.body, color: colors.accent } as any,
})
