// Protocol presets — default parameters per docs/03-training-and-data-model.md
// "Protocols". These are starting points for Session setup (docs/04), not
// hardcoded behavior — every value here is user-configurable in the UI.

export interface MaxEffortPreset {
  kind: 'max_effort'
  pullDurationMs: number
  attemptsPerHand: number
  restBetweenAttemptsMs: number
}

export interface TargetBandPreset {
  kind: 'target_band'
  targetPercent: number
  toleranceKg: number
  workDurationMs: number
  interHandRestMs: number
  interSetRestMs: number
  setCount: number
}

export interface RepeaterPreset {
  kind: 'repeaters'
  targetPercent: number
  toleranceKg: number
  repWorkMs: number
  repRestMs: number
  repCount: number
  interHandRestMs: number
  interSetRestMs: number
  setCount: number
}

export type ProtocolPreset = MaxEffortPreset | TargetBandPreset | RepeaterPreset

/** docs/03 "Max-effort test (block pull)" defaults table. */
export const maxEffortDefault: MaxEffortPreset = {
  kind: 'max_effort',
  pullDurationMs: 3000,
  attemptsPerHand: 3,
  restBetweenAttemptsMs: 90_000,
}

/**
 * docs/03 "Target-band training set" has no single canonical parameter set
 * (it's Pascal's own design) — these are reasonable starting defaults; the
 * tolerance band width itself is an open question in docs/03 pending
 * hardware feel-testing (Phase H).
 */
export const targetBandDefault: TargetBandPreset = {
  kind: 'target_band',
  targetPercent: 80,
  toleranceKg: 2,
  workDurationMs: 10_000,
  interHandRestMs: 5000, // Tyler Nelson's block-pull protocol, per docs/03
  interSetRestMs: 180_000, // 3 min, max-strength default
  setCount: 5,
}

/**
 * Lattice's anaerobic-capacity repeater parameters — chosen as the default
 * over Hörst's classic 6x(7/3) because they're specified as %-of-max,
 * fitting Pascal's prescription model directly. See docs/03 "Repeaters".
 */
export const repeaterDefault: RepeaterPreset = {
  kind: 'repeaters',
  targetPercent: 80,
  toleranceKg: 2,
  repWorkMs: 7000,
  repRestMs: 3000,
  repCount: 5,
  interHandRestMs: 5000,
  interSetRestMs: 150_000, // 2.5 min, per Lattice anaerobic-capacity
  setCount: 3,
}

/** Hörst's classic repeater parameters — offered as an alternative preset, per docs/03. */
export const repeaterHorstClassic: RepeaterPreset = {
  kind: 'repeaters',
  targetPercent: 70, // midpoint of Hörst's 60-80% MVC advanced range
  toleranceKg: 2,
  repWorkMs: 7000,
  repRestMs: 3000,
  repCount: 6,
  interHandRestMs: 5000,
  interSetRestMs: 780_000, // 13 min, midpoint of Hörst's 12-15 min circuit rest
  setCount: 1,
}
