import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Sharing from 'expo-sharing'
import { useRepositories } from '../../src/services/db/useRepositories'
import { exportCsv } from '../../src/services/export/exportCsv'
import { exportDatabase } from '../../src/services/export/exportDatabase'
import { colors, spacing, typography } from '../../src/theme/tokens'

const LAST_EXPORTED_AT_KEY = 'lastExportedAt'
/** docs/06: "periodically remind... if they haven't in a long while" — not a fixed number in the docs, so 4 weeks is a deliberately generous starting point (quiet, not naggy). */
const EXPORT_REMINDER_WINDOW_MS = 4 * 7 * 24 * 60 * 60 * 1000

type ExportState = 'idle' | 'exporting-csv' | 'exporting-db'

/**
 * Settings — export is the primary content for Phase 7 (docs/08). See
 * docs/06-non-functional-and-open-source.md "Backup & data portability":
 * offline-only means CSV/database export IS the backup story, not a
 * nicety.
 */
export default function SettingsScreen() {
  const repos = useRepositories()
  const [state, setState] = useState<ExportState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastExportedAt, setLastExportedAt] = useState<number | null>(null)
  // Date.now() must not be called during render (react-hooks/purity) — it's
  // an impure read that could produce a different result on every render.
  // A reminder threshold only needs to be "roughly now," so it's captured
  // once, on mount, rather than recomputed on every render.
  const [nowAtMount] = useState(() => Date.now())

  useEffect(() => {
    if (!repos) return
    repos.appSettings.get(LAST_EXPORTED_AT_KEY).then((value) => {
      setLastExportedAt(value ? Number(value) : null)
    })
  }, [repos])

  async function recordExported() {
    if (!repos) return
    const now = Date.now()
    await repos.appSettings.set(LAST_EXPORTED_AT_KEY, String(now))
    setLastExportedAt(now)
  }

  async function handleExportCsv() {
    if (!repos || state !== 'idle') return
    setError(null)
    setState('exporting-csv')
    try {
      const { summaryFile, samplesFile } = await exportCsv(repos)
      await recordExported()
      const available = await Sharing.isAvailableAsync()
      if (available) {
        await Sharing.shareAsync(summaryFile.uri)
        await Sharing.shareAsync(samplesFile.uri)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV export failed.')
    } finally {
      setState('idle')
    }
  }

  async function handleExportDatabase() {
    if (state !== 'idle') return
    setError(null)
    setState('exporting-db')
    try {
      const file = await exportDatabase()
      await recordExported()
      const available = await Sharing.isAvailableAsync()
      if (available) {
        await Sharing.shareAsync(file.uri)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Database export failed.')
    } finally {
      setState('idle')
    }
  }

  const showReminder =
    lastExportedAt !== null ? nowAtMount - lastExportedAt > EXPORT_REMINDER_WINDOW_MS : false

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        <Text style={styles.sectionLabel}>Export data</Text>
        <Text style={styles.helperText}>
          Pascal is fully offline — your training history exists only on this device. Export
          regularly so a lost or wiped phone doesn&rsquo;t mean starting over.
        </Text>

        {lastExportedAt !== null && (
          <Text style={styles.lastExportText}>
            Last exported {new Date(lastExportedAt).toLocaleDateString()}
          </Text>
        )}
        {showReminder && (
          <Text style={styles.reminderText}>
            It&rsquo;s been a while since your last export — worth doing again.
          </Text>
        )}

        <TouchableOpacity
          style={[styles.button, state !== 'idle' && styles.buttonDisabled]}
          onPress={handleExportCsv}
          disabled={state !== 'idle'}
        >
          {state === 'exporting-csv' ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.buttonText}>Export CSV</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.buttonCaption}>
          Two files: a summary (one row per effort, with exercise, edge depth, and smoothing window)
          and raw samples.
        </Text>

        <TouchableOpacity
          style={[styles.buttonSecondary, state !== 'idle' && styles.buttonDisabled]}
          onPress={handleExportDatabase}
          disabled={state !== 'idle'}
        >
          {state === 'exporting-db' ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={styles.buttonSecondaryText}>Export full database</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.buttonCaption}>
          A copy of the raw database file — the most complete backup, and the only way to move your
          history to a new device.
        </Text>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>About</Text>
        <Text style={styles.helperText}>
          Pascal is fully offline. No accounts, no sync, no analytics — nothing leaves this device
          unless you export it yourself.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  title: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md } as any,
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  } as any,
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  } as any,
  lastExportText: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  } as any,
  reminderText: {
    ...typography.caption,
    color: colors.warning,
    marginBottom: spacing.sm,
  } as any,
  button: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  buttonText: { ...typography.body, color: colors.bg, fontWeight: '700' } as any,
  buttonSecondary: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  buttonSecondaryText: { ...typography.body, color: colors.textPrimary, fontWeight: '600' } as any,
  buttonDisabled: { opacity: 0.5 },
  buttonCaption: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  } as any,
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.md,
  } as any,
})
