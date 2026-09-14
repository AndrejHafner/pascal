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
}
