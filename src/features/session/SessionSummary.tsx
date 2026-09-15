import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { computeAsymmetry } from '../../core/metrics/asymmetry'
import type { Repositories } from '../../services/db/repositories'
import type { Effort } from '../../core/types'
import { colors, spacing, typography } from '../../theme/tokens'

/**
 * Session summary — see docs/04-screens-and-ux.md "Session summary":
 * totals, per-exercise max + whether it's a new PB (celebrated quietly),
 * asymmetry summary, notes, then Save. Aborted/partial sets are shown as
 * such, never dropped, per docs/06 "never silently discard."
 */
export function SessionSummary({
  sessionId,
  repos,
  onSaved,
}: {
  sessionId: string
  repos: Repositories
  onSaved: () => void
}) {
  const [efforts, setEfforts] = useState<Effort[] | null>(null)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const sets = await repos.trainingSets.listBySession(sessionId)
      const allEfforts: Effort[] = []
      for (const set of sets) {
        const setEfforts = await repos.efforts.listBySet(set.id)
        allEfforts.push(...setEfforts)
      }
      if (!cancelled) setEfforts(allEfforts)
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, repos])

  async function save() {
    if (notes.trim()) {
      await repos.sessions.updateNotes(sessionId, notes.trim())
    }
    await repos.sessions.end(sessionId)
    onSaved()
  }

  if (!efforts) {
    return (
      <View style={styles.centerFill}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    )
  }

  const completed = efforts.filter((e) => e.status === 'completed')
  const totalTutMs = completed.reduce((sum, e) => sum + (e.timeUnderTensionMs ?? 0), 0)
  const totalImpulse = completed.reduce((sum, e) => sum + (e.impulseKgS ?? 0), 0)
  const aborted = efforts.filter((e) => e.status !== 'completed')

  const leftPeaks = completed
    .filter((e) => e.hand === 'left')
    .map((e) => e.peakForceSmoothedKg ?? 0)
  const rightPeaks = completed
    .filter((e) => e.hand === 'right')
    .map((e) => e.peakForceSmoothedKg ?? 0)
  const leftMax = leftPeaks.length > 0 ? Math.max(...leftPeaks) : null
  const rightMax = rightPeaks.length > 0 ? Math.max(...rightPeaks) : null
  const asymmetry = leftMax != null && rightMax != null ? computeAsymmetry(leftMax, rightMax) : null

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Session complete</Text>

      <View style={styles.statsGrid}>
        <Stat label="Sets" value={String(new Set(completed.map((e) => e.setId)).size)} />
        <Stat label="Total TUT" value={`${(totalTutMs / 1000).toFixed(0)}s`} />
        <Stat label="Total impulse" value={`${totalImpulse.toFixed(0)} kg·s`} />
      </View>

      {(leftMax != null || rightMax != null) && (
        <View style={styles.maxRow}>
          <Text style={styles.maxLabel}>
            Left max: {leftMax != null ? `${leftMax.toFixed(1)} kg` : '—'}
          </Text>
          <Text style={styles.maxLabel}>
            Right max: {rightMax != null ? `${rightMax.toFixed(1)} kg` : '—'}
          </Text>
        </View>
      )}

      {asymmetry && (
        <Text style={styles.asymmetryText}>
          Asymmetry: {Math.round(asymmetry.percentDiff * 100)}%
          {asymmetry.exceedsThreshold ? ' (above your threshold — just a note)' : ''}
        </Text>
      )}

      {aborted.length > 0 && (
        <Text style={styles.abortedNote}>
          {aborted.length} set{aborted.length > 1 ? 's' : ''} {aborted.length > 1 ? 'were' : 'was'}{' '}
          not completed ({aborted.map((e) => e.status).join(', ')}) — kept, not dropped.
        </Text>
      )}

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional"
        placeholderTextColor={colors.textTertiary}
        multiline
      />

      <TouchableOpacity style={styles.saveButton} onPress={save}>
        <Text style={styles.saveButtonText}>Save</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary } as any,
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md } as any,
  statsGrid: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { ...typography.metricMedium, color: colors.textPrimary } as any,
  statLabel: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs } as any,
  maxRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  maxLabel: { ...typography.body, color: colors.textSecondary } as any,
  asymmetryText: { ...typography.caption, color: colors.textTertiary } as any,
  abortedNote: { ...typography.caption, color: colors.warning } as any,
  label: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  } as any,
  notesInput: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
  } as any,
  saveButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  saveButtonText: { ...typography.body, color: colors.bg, fontWeight: '700' } as any,
})
