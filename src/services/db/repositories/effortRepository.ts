import type { SQLiteDatabase } from 'expo-sqlite'
import type { Effort } from '../../../core/types'
import { newId } from '../id'

interface EffortRow {
  id: string
  set_id: string
  hand: string
  started_at: number
  ended_at: number | null
  status: string
  added_load_kg: number
  device_type: string
  device_sequence: string | null
  sample_rate_hz: number | null
  peak_force_smoothed_kg: number | null
  smoothing_window_ms: number | null
  peak_force_instant_kg: number | null
  mean_force_kg: number | null
  impulse_kg_s: number | null
  time_under_tension_ms: number | null
  time_in_band_ms: number | null
  time_above_band_ms: number | null
  time_below_band_ms: number | null
  time_to_peak_ms: number | null
  time_to_target_ms: number | null
  fatigue_index: number | null
}

function fromRow(row: EffortRow): Effort {
  return {
    id: row.id,
    setId: row.set_id,
    hand: row.hand as Effort['hand'],
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status as Effort['status'],
    addedLoadKg: row.added_load_kg,
    deviceType: row.device_type as Effort['deviceType'],
    deviceSequence: row.device_sequence,
    sampleRateHz: row.sample_rate_hz,
    peakForceSmoothedKg: row.peak_force_smoothed_kg,
    smoothingWindowMs: row.smoothing_window_ms,
    peakForceInstantKg: row.peak_force_instant_kg,
    meanForceKg: row.mean_force_kg,
    impulseKgS: row.impulse_kg_s,
    timeUnderTensionMs: row.time_under_tension_ms,
    timeInBandMs: row.time_in_band_ms,
    timeAboveBandMs: row.time_above_band_ms,
    timeBelowBandMs: row.time_below_band_ms,
    timeToPeakMs: row.time_to_peak_ms,
    timeToTargetMs: row.time_to_target_ms,
    fatigueIndex: row.fatigue_index,
  }
}

/** One denormalized row for CSV export — see EffortRepository.listForExport. */
export interface EffortExportRow {
  sessionId: string
  sessionStartedAt: number
  sessionBodyweightKg: number
  setId: string
  setKind: string
  setOrdinal: number
  targetPercent: number | null
  targetForceKg: number | null
  toleranceBandKg: number | null
  exerciseId: string
  exerciseName: string
  gripType: string
  edgeDepthMm: number
  modality: string
  effortId: string
  hand: string
  status: string
  effortStartedAt: number
  effortEndedAt: number | null
  deviceType: string
  sampleRateHz: number | null
  peakForceSmoothedKg: number | null
  smoothingWindowMs: number | null
  peakForceInstantKg: number | null
  meanForceKg: number | null
  impulseKgS: number | null
  timeUnderTensionMs: number | null
  timeInBandMs: number | null
  timeAboveBandMs: number | null
  timeBelowBandMs: number | null
  timeToPeakMs: number | null
  timeToTargetMs: number | null
  fatigueIndex: number | null
}

interface EffortExportRowFlat {
  session_id: string
  session_started_at: number
  session_bodyweight_kg: number
  set_id: string
  set_kind: string
  set_ordinal: number
  target_percent: number | null
  target_force_kg: number | null
  tolerance_band_kg: number | null
  exercise_id: string
  exercise_name: string
  grip_type: string
  edge_depth_mm: number
  modality: string
  effort_id: string
  hand: string
  status: string
  effort_started_at: number
  effort_ended_at: number | null
  device_type: string
  sample_rate_hz: number | null
  peak_force_smoothed_kg: number | null
  smoothing_window_ms: number | null
  peak_force_instant_kg: number | null
  mean_force_kg: number | null
  impulse_kg_s: number | null
  time_under_tension_ms: number | null
  time_in_band_ms: number | null
  time_above_band_ms: number | null
  time_below_band_ms: number | null
  time_to_peak_ms: number | null
  time_to_target_ms: number | null
  fatigue_index: number | null
}

function fromExportRow(row: EffortExportRowFlat): EffortExportRow {
  return {
    sessionId: row.session_id,
    sessionStartedAt: row.session_started_at,
    sessionBodyweightKg: row.session_bodyweight_kg,
    setId: row.set_id,
    setKind: row.set_kind,
    setOrdinal: row.set_ordinal,
    targetPercent: row.target_percent,
    targetForceKg: row.target_force_kg,
    toleranceBandKg: row.tolerance_band_kg,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    gripType: row.grip_type,
    edgeDepthMm: row.edge_depth_mm,
    modality: row.modality,
    effortId: row.effort_id,
    hand: row.hand,
    status: row.status,
    effortStartedAt: row.effort_started_at,
    effortEndedAt: row.effort_ended_at,
    deviceType: row.device_type,
    sampleRateHz: row.sample_rate_hz,
    peakForceSmoothedKg: row.peak_force_smoothed_kg,
    smoothingWindowMs: row.smoothing_window_ms,
    peakForceInstantKg: row.peak_force_instant_kg,
    meanForceKg: row.mean_force_kg,
    impulseKgS: row.impulse_kg_s,
    timeUnderTensionMs: row.time_under_tension_ms,
    timeInBandMs: row.time_in_band_ms,
    timeAboveBandMs: row.time_above_band_ms,
    timeBelowBandMs: row.time_below_band_ms,
    timeToPeakMs: row.time_to_peak_ms,
    timeToTargetMs: row.time_to_target_ms,
    fatigueIndex: row.fatigue_index,
  }
}

export type EffortMetrics = Pick<
  Effort,
  | 'peakForceSmoothedKg'
  | 'smoothingWindowMs'
  | 'peakForceInstantKg'
  | 'meanForceKg'
  | 'impulseKgS'
  | 'timeUnderTensionMs'
  | 'timeInBandMs'
  | 'timeAboveBandMs'
  | 'timeBelowBandMs'
  | 'timeToPeakMs'
  | 'timeToTargetMs'
  | 'fatigueIndex'
>

export class EffortRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async start(input: {
    setId: string
    hand: Effort['hand']
    deviceType: Effort['deviceType']
    deviceSequence?: string | null
    addedLoadKg?: number
  }): Promise<Effort> {
    const effort: Effort = {
      id: newId(),
      setId: input.setId,
      hand: input.hand,
      startedAt: Date.now(),
      endedAt: null,
      status: 'aborted', // overwritten by end(); an effort killed mid-flight stays 'aborted', never silently 'completed'
      addedLoadKg: input.addedLoadKg ?? 0,
      deviceType: input.deviceType,
      deviceSequence: input.deviceSequence ?? null,
      sampleRateHz: null,
      peakForceSmoothedKg: null,
      smoothingWindowMs: null,
      peakForceInstantKg: null,
      meanForceKg: null,
      impulseKgS: null,
      timeUnderTensionMs: null,
      timeInBandMs: null,
      timeAboveBandMs: null,
      timeBelowBandMs: null,
      timeToPeakMs: null,
      timeToTargetMs: null,
      fatigueIndex: null,
    }
    await this.db.runAsync(
      `INSERT INTO effort (
         id, set_id, hand, started_at, ended_at, status, added_load_kg,
         device_type, device_sequence, sample_rate_hz
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      effort.id,
      effort.setId,
      effort.hand,
      effort.startedAt,
      effort.endedAt,
      effort.status,
      effort.addedLoadKg,
      effort.deviceType,
      effort.deviceSequence,
      effort.sampleRateHz,
    )
    return effort
  }

  /**
   * Per docs/06-non-functional-and-open-source.md "Data integrity": never
   * silently discard a set. status must always be explicit —
   * 'aborted'/'disconnected' are as valid an end state as 'completed'.
   */
  async end(
    id: string,
    status: Effort['status'],
    metrics: EffortMetrics,
    sampleRateHz: number | null,
    endedAt: number = Date.now(),
  ): Promise<void> {
    await this.db.runAsync(
      `UPDATE effort SET
         ended_at = ?, status = ?, sample_rate_hz = ?,
         peak_force_smoothed_kg = ?, smoothing_window_ms = ?, peak_force_instant_kg = ?,
         mean_force_kg = ?, impulse_kg_s = ?,
         time_under_tension_ms = ?, time_in_band_ms = ?, time_above_band_ms = ?, time_below_band_ms = ?,
         time_to_peak_ms = ?, time_to_target_ms = ?, fatigue_index = ?
       WHERE id = ?;`,
      endedAt,
      status,
      sampleRateHz,
      metrics.peakForceSmoothedKg,
      metrics.smoothingWindowMs,
      metrics.peakForceInstantKg,
      metrics.meanForceKg,
      metrics.impulseKgS,
      metrics.timeUnderTensionMs,
      metrics.timeInBandMs,
      metrics.timeAboveBandMs,
      metrics.timeBelowBandMs,
      metrics.timeToPeakMs,
      metrics.timeToTargetMs,
      metrics.fatigueIndex,
      id,
    )
  }

  async getById(id: string): Promise<Effort | null> {
    const row = await this.db.getFirstAsync<EffortRow>(`SELECT * FROM effort WHERE id = ?;`, id)
    return row ? fromRow(row) : null
  }

  async listBySet(setId: string): Promise<Effort[]> {
    const rows = await this.db.getAllAsync<EffortRow>(
      `SELECT * FROM effort WHERE set_id = ? ORDER BY hand ASC;`,
      setId,
    )
    return rows.map(fromRow)
  }

  /**
   * Raw rows behind the Progress screen's "training load — TUT and impulse
   * per week, per exercise" (docs/04). Week-bucketing is deliberately NOT
   * done in SQL — SQLite's date functions assume Unix *seconds*, this
   * codebase stores epoch *ms* throughout, and "start of week" is a
   * convention (Mon vs Sun) better expressed and unit-tested as plain JS
   * (see core/progress/trainingLoad.ts) than baked into a query string.
   * completed-only, per docs/03's metrics being defined for completed
   * efforts.
   */
  /**
   * One row per effort with full session/set/exercise context, streamed via
   * getEachAsync rather than loaded as one array — see docs/07-architecture.md
   * "Export": "a year of sessions is millions of [sample] rows," and effort
   * counts, while much smaller, still shouldn't be assumed to fit comfortably
   * in memory for a years-old install. Includes smoothingWindowMs and
   * edgeDepthMm per docs/03: "without which the numbers aren't interpretable
   * by anyone else." Ordered by session start then set ordinal then hand so
   * the export reads in a natural chronological/grouped order.
   */
  async *listForExport(): AsyncIterable<EffortExportRow> {
    const rows = this.db.getEachAsync<EffortExportRowFlat>(
      `SELECT
         sess.id AS session_id, sess.started_at AS session_started_at,
         sess.bodyweight_kg AS session_bodyweight_kg,
         ts.id AS set_id, ts.kind AS set_kind, ts.ordinal AS set_ordinal,
         ts.target_percent, ts.target_force_kg, ts.tolerance_band_kg,
         ex.id AS exercise_id, ex.name AS exercise_name, ex.grip_type,
         ex.edge_depth_mm, ex.modality,
         ef.id AS effort_id, ef.hand, ef.status, ef.started_at AS effort_started_at,
         ef.ended_at AS effort_ended_at, ef.device_type, ef.sample_rate_hz,
         ef.peak_force_smoothed_kg, ef.smoothing_window_ms, ef.peak_force_instant_kg,
         ef.mean_force_kg, ef.impulse_kg_s, ef.time_under_tension_ms,
         ef.time_in_band_ms, ef.time_above_band_ms, ef.time_below_band_ms,
         ef.time_to_peak_ms, ef.time_to_target_ms, ef.fatigue_index
       FROM effort ef
       JOIN training_set ts ON ts.id = ef.set_id
       JOIN exercise ex ON ex.id = ts.exercise_id
       JOIN session sess ON sess.id = ts.session_id
       ORDER BY sess.started_at ASC, ts.ordinal ASC, ef.hand ASC;`,
    )
    for await (const row of rows) {
      yield fromExportRow(row)
    }
  }

  async listCompletedForTrainingLoad(
    exerciseId: string,
  ): Promise<{ startedAt: number; timeUnderTensionMs: number; impulseKgS: number }[]> {
    const rows = await this.db.getAllAsync<{
      started_at: number
      time_under_tension_ms: number | null
      impulse_kg_s: number | null
    }>(
      `SELECT ef.started_at, ef.time_under_tension_ms, ef.impulse_kg_s
       FROM effort ef
       JOIN training_set ts ON ts.id = ef.set_id
       WHERE ts.exercise_id = ? AND ef.status = 'completed'
       ORDER BY ef.started_at ASC;`,
      exerciseId,
    )
    return rows.map((row) => ({
      startedAt: row.started_at,
      timeUnderTensionMs: row.time_under_tension_ms ?? 0,
      impulseKgS: row.impulse_kg_s ?? 0,
    }))
  }
}
