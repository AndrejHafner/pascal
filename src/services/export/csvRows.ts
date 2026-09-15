// Pure row-shaping for the two export CSVs — kept separate from
// exportCsv.ts's file-writing I/O so the actual column mapping (the part
// with real correctness risk: a misordered or dropped field silently
// corrupts every exported row) is unit-testable without a native
// filesystem module. See docs/03/docs/07 "Export".

import type { EffortExportRow } from '../db/repositories/effortRepository'
import type { Sample } from '../../core/types'

export const SUMMARY_HEADER = [
  'session_id',
  'session_started_at',
  'session_bodyweight_kg',
  'set_id',
  'set_kind',
  'set_ordinal',
  'target_percent',
  'target_force_kg',
  'tolerance_band_kg',
  'exercise_id',
  'exercise_name',
  'grip_type',
  'edge_depth_mm',
  'modality',
  'effort_id',
  'hand',
  'status',
  'effort_started_at',
  'effort_ended_at',
  'device_type',
  'sample_rate_hz',
  'peak_force_smoothed_kg',
  'smoothing_window_ms',
  'peak_force_instant_kg',
  'mean_force_kg',
  'impulse_kg_s',
  'time_under_tension_ms',
  'time_in_band_ms',
  'time_above_band_ms',
  'time_below_band_ms',
  'time_to_peak_ms',
  'time_to_target_ms',
  'fatigue_index',
]

export const SAMPLES_HEADER = ['effort_id', 'offset_ms', 'force_kg']

/** Field order must match SUMMARY_HEADER exactly, column for column. */
export function summaryRowFields(row: EffortExportRow): (string | number | null)[] {
  return [
    row.sessionId,
    row.sessionStartedAt,
    row.sessionBodyweightKg,
    row.setId,
    row.setKind,
    row.setOrdinal,
    row.targetPercent,
    row.targetForceKg,
    row.toleranceBandKg,
    row.exerciseId,
    row.exerciseName,
    row.gripType,
    row.edgeDepthMm,
    row.modality,
    row.effortId,
    row.hand,
    row.status,
    row.effortStartedAt,
    row.effortEndedAt,
    row.deviceType,
    row.sampleRateHz,
    row.peakForceSmoothedKg,
    row.smoothingWindowMs,
    row.peakForceInstantKg,
    row.meanForceKg,
    row.impulseKgS,
    row.timeUnderTensionMs,
    row.timeInBandMs,
    row.timeAboveBandMs,
    row.timeBelowBandMs,
    row.timeToPeakMs,
    row.timeToTargetMs,
    row.fatigueIndex,
  ]
}

/** Field order must match SAMPLES_HEADER exactly, column for column. */
export function sampleRowFields(row: Sample): (string | number | null)[] {
  return [row.effortId, row.offsetMs, row.forceKg]
}
