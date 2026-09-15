import {
  SUMMARY_HEADER,
  SAMPLES_HEADER,
  summaryRowFields,
  sampleRowFields,
} from '../../../src/services/export/csvRows'
import type { EffortExportRow } from '../../../src/services/db/repositories/effortRepository'
import type { Sample } from '../../../src/core/types'

const fullRow: EffortExportRow = {
  sessionId: 'sess-1',
  sessionStartedAt: 1000,
  sessionBodyweightKg: 78,
  setId: 'set-1',
  setKind: 'max_effort',
  setOrdinal: 0,
  targetPercent: null,
  targetForceKg: null,
  toleranceBandKg: null,
  exerciseId: 'ex-1',
  exerciseName: '20mm edge',
  gripType: 'half-crimp',
  edgeDepthMm: 20,
  modality: 'block_pull',
  effortId: 'eff-1',
  hand: 'left',
  status: 'completed',
  effortStartedAt: 1100,
  effortEndedAt: 1200,
  deviceType: 'emulator',
  sampleRateHz: 60,
  peakForceSmoothedKg: 38,
  smoothingWindowMs: 1000,
  peakForceInstantKg: 39,
  meanForceKg: 33,
  impulseKgS: 120,
  timeUnderTensionMs: 4000,
  timeInBandMs: null,
  timeAboveBandMs: null,
  timeBelowBandMs: null,
  timeToPeakMs: 600,
  timeToTargetMs: null,
  fatigueIndex: null,
}

describe('summaryRowFields', () => {
  it('produces exactly as many fields as SUMMARY_HEADER has columns', () => {
    expect(summaryRowFields(fullRow)).toHaveLength(SUMMARY_HEADER.length)
  })

  it('every field lands in the column its header name implies', () => {
    const fields = summaryRowFields(fullRow)
    const byHeader = Object.fromEntries(SUMMARY_HEADER.map((h, i) => [h, fields[i]]))

    expect(byHeader.session_id).toBe('sess-1')
    expect(byHeader.exercise_name).toBe('20mm edge')
    expect(byHeader.edge_depth_mm).toBe(20)
    expect(byHeader.smoothing_window_ms).toBe(1000)
    expect(byHeader.peak_force_smoothed_kg).toBe(38)
    expect(byHeader.hand).toBe('left')
    expect(byHeader.status).toBe('completed')
    expect(byHeader.session_bodyweight_kg).toBe(78)
  })

  it('includes smoothing window and edge depth — docs/03: without these the numbers are uninterpretable', () => {
    const fields = summaryRowFields(fullRow)
    expect(fields).toContain(1000) // smoothingWindowMs
    expect(fields).toContain(20) // edgeDepthMm
  })

  it('null metrics (e.g. an aborted effort) pass through as null, not a coerced value', () => {
    const aborted: EffortExportRow = {
      ...fullRow,
      status: 'aborted',
      peakForceSmoothedKg: null,
      smoothingWindowMs: null,
      timeUnderTensionMs: null,
    }
    const fields = summaryRowFields(aborted)
    const byHeader = Object.fromEntries(SUMMARY_HEADER.map((h, i) => [h, fields[i]]))
    expect(byHeader.peak_force_smoothed_kg).toBeNull()
    expect(byHeader.status).toBe('aborted')
  })
})

describe('sampleRowFields', () => {
  const sample: Sample = { effortId: 'eff-1', offsetMs: 160, forceKg: 32.5 }

  it('produces exactly as many fields as SAMPLES_HEADER has columns', () => {
    expect(sampleRowFields(sample)).toHaveLength(SAMPLES_HEADER.length)
  })

  it('maps fields to the correct columns', () => {
    const fields = sampleRowFields(sample)
    const byHeader = Object.fromEntries(SAMPLES_HEADER.map((h, i) => [h, fields[i]]))
    expect(byHeader.effort_id).toBe('eff-1')
    expect(byHeader.offset_ms).toBe(160)
    expect(byHeader.force_kg).toBe(32.5)
  })
})
