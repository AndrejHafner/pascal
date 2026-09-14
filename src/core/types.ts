// Plain domain types shared across the app. No framework imports here —
// see docs/07-architecture.md "Layering": core/ imports nothing from
// services/, features/, or app/.

export type Hand = 'left' | 'right'

export type Modality = 'block_pull' | 'hang'

export type SetKind = 'max_effort' | 'target_band' | 'all_out'

export type EffortStatus = 'completed' | 'aborted' | 'disconnected'

export type DeviceType = 'progressor' | 'whc06' | 'emulator'

export type MaxRule = 'best_attempt' | 'best_2_of_3_avg'

export interface Exercise {
  id: string
  name: string
  gripType: string
  /** Required — see docs/03-training-and-data-model.md "Exercise / movement". */
  edgeDepthMm: number
  modality: Modality
  notes: string | null
  createdAt: number
}

export interface Session {
  id: string
  startedAt: number
  endedAt: number | null
  /** Snapshot at session start. Never back-filled — see docs/03. */
  bodyweightKg: number
  notes: string | null
}

export interface TrainingSet {
  id: string
  sessionId: string
  exerciseId: string
  kind: SetKind
  ordinal: number

  // target_band only
  sourceMaxEffortId: string | null
  targetPercent: number | null
  targetForceKg: number | null
  toleranceBandKg: number | null
  plannedWorkMs: number | null

  // repeaters, nullable
  repWorkMs: number | null
  repRestMs: number | null
  repCount: number | null

  interHandRestMs: number
  interSetRestMs: number
}

export interface Effort {
  id: string
  setId: string
  hand: Hand
  startedAt: number
  endedAt: number | null
  status: EffortStatus
  addedLoadKg: number
  deviceType: DeviceType
  /** Emulator sequence name — set only when deviceType === 'emulator'. */
  deviceSequence: string | null
  /** Observed, not assumed — see docs/06-non-functional-and-open-source.md. */
  sampleRateHz: number | null

  // Derived metrics, computed once at effort end — see
  // docs/07-architecture.md "Metrics: incremental, then final".
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

export interface Sample {
  effortId: string
  /** Relative to effort start — avoids clock drift. See docs/03. */
  offsetMs: number
  forceKg: number
}

export interface MaxRecord {
  id: string
  exerciseId: string
  hand: Hand
  effortId: string
  forceKg: number
  smoothingWindowMs: number
  rule: MaxRule
  bodyweightKgAtTest: number
  recordedAt: number
}

/** A single decoded reading off the wire — before it's attached to an Effort. */
export interface RawSample {
  forceKg: number
  /** Device-native monotonic timestamp in ms, when available (Progressor). Not wall-clock. */
  deviceTimestampMs?: number
}
