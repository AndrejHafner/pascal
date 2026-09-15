import { StyleSheet, Text, View } from 'react-native'
import { computeAsymmetry } from '../../core/metrics/asymmetry'
import type { Effort } from '../../core/types'
import { formatSeconds } from './formatDuration'
import { colors, spacing, typography } from '../../theme/tokens'

/**
 * Set summary — appears during rest, per docs/04-screens-and-ux.md "Set
 * summary (immediately after each set)": "the rest time is used
 * productively." Left vs right side by side, asymmetry as a quiet
 * informational note (never an alarm — the evidence for acting on
 * asymmetry is weak, per docs/03).
 */
export function SetSummary({
  leftEffort,
  rightEffort,
}: {
  leftEffort: Effort | null
  rightEffort: Effort | null
}) {
  const asymmetry =
    leftEffort?.peakForceSmoothedKg != null && rightEffort?.peakForceSmoothedKg != null
      ? computeAsymmetry(leftEffort.peakForceSmoothedKg, rightEffort.peakForceSmoothedKg)
      : null

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <HandSummary label="LEFT" color={colors.handLeft} effort={leftEffort} />
        <HandSummary label="RIGHT" color={colors.handRight} effort={rightEffort} />
      </View>
      {asymmetry && asymmetry.exceedsThreshold && (
        <Text style={styles.asymmetryNote}>
          {Math.round(asymmetry.percentDiff * 100)}% difference between hands — just a note, not a
          concern on its own.
        </Text>
      )}
    </View>
  )
}

function HandSummary({
  label,
  color,
  effort,
}: {
  label: string
  color: string
  effort: Effort | null
}) {
  return (
    <View style={styles.hand}>
      <Text style={[styles.handLabel, { color }]}>{label}</Text>
      <Text style={styles.peakValue}>
        {effort?.peakForceSmoothedKg != null ? effort.peakForceSmoothedKg.toFixed(1) : '—'}
      </Text>
      <Text style={styles.peakUnit}>kg peak</Text>
      {effort?.timeUnderTensionMs != null && (
        <Text style={styles.detailText}>TUT {formatSeconds(effort.timeUnderTensionMs)}</Text>
      )}
      {effort?.status && effort.status !== 'completed' && (
        <Text style={styles.statusText}>{effort.status}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  hand: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
  },
  handLabel: { ...typography.label } as any,
  peakValue: { ...typography.metricLarge, color: colors.textPrimary, marginTop: spacing.xs } as any,
  peakUnit: { ...typography.caption, color: colors.textTertiary } as any,
  detailText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs } as any,
  statusText: { ...typography.caption, color: colors.warning, marginTop: spacing.xs } as any,
  asymmetryNote: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  } as any,
})
