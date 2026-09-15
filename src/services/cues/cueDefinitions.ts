// Cue definitions transcribed from docs/04-screens-and-ux.md "Cues (audio +
// haptic)" — the exact tone-shape table and the requirement that "each tone
// needs a distinct haptic pattern too, not just a generic buzz, since
// haptic-only users lose the pitch information entirely."

export type CueKind =
  | 'countdown-tick'
  | 'countdown-go'
  | 'entered-band'
  | 'dropped-below'
  | 'tut-target-reached'
  | 'hand-switch'
  | 'rest-ending'

export type HapticStep =
  | { kind: 'impact'; style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' }
  | { kind: 'notification'; style: 'success' | 'warning' | 'error' }
  | { kind: 'selection' }
  | { kind: 'wait'; ms: number }

export interface CueDefinition {
  /**
   * Path to the tone asset — null for now (see docs/08-roadmap.md Phase 4:
   * no audio assets exist yet, expo-audio needs real files, not synthesized
   * tones). playCue() no-ops the audio side until this is populated; the
   * haptic side is fully real regardless, per docs/04's "haptic-only must
   * be a fully functional mode."
   */
  toneAsset: null
  /** Ordered haptic steps — see docs/04's tone-shape table for the pattern each maps to. */
  haptics: HapticStep[]
}

// "Countdown tick / go" — "three short ticks, then one longer higher tone."
// Modeled as: three light taps (the ticks), then a stronger impact (the "go").
const countdownTick: CueDefinition = {
  toneAsset: null,
  haptics: [{ kind: 'impact', style: 'light' }],
}
const countdownGo: CueDefinition = {
  toneAsset: null,
  haptics: [{ kind: 'impact', style: 'medium' }],
}

// "Entered band" — "short rising two-note" -> light haptic, per docs/04
// "confirms the clock started without needing to look."
const enteredBand: CueDefinition = {
  toneAsset: null,
  haptics: [{ kind: 'impact', style: 'light' }],
}

// "Dropped below band" — "short falling two-note, louder/sharper than the
// others." Per docs/04: "the most important cue in the app." Two sharp
// impacts in quick succession to be maximally distinct from every other
// single-pulse cue.
const droppedBelow: CueDefinition = {
  toneAsset: null,
  haptics: [
    { kind: 'impact', style: 'rigid' },
    { kind: 'wait', ms: 80 },
    { kind: 'impact', style: 'rigid' },
  ],
}

// "TUT target reached" — "three-note ascending flourish" -> success
// notification (Success is the strongest positive built-in pattern) plus a
// ramp of increasing-intensity impacts to echo "ascending."
const tutTargetReached: CueDefinition = {
  toneAsset: null,
  haptics: [
    { kind: 'impact', style: 'light' },
    { kind: 'wait', ms: 60 },
    { kind: 'impact', style: 'medium' },
    { kind: 'wait', ms: 60 },
    { kind: 'notification', style: 'success' },
  ],
}

// "Hand switch" — "distinct double-beep, unlike any single-event cue."
const handSwitch: CueDefinition = {
  toneAsset: null,
  haptics: [
    { kind: 'impact', style: 'soft' },
    { kind: 'wait', ms: 120 },
    { kind: 'impact', style: 'soft' },
  ],
}

// "Rest ending" — "same [3-2-1] countdown pattern as set start... fewer
// distinct sounds to learn." Reuses countdown-tick/-go rather than a new
// definition.
const restEnding: CueDefinition = countdownTick

export const cueDefinitions: Record<CueKind, CueDefinition> = {
  'countdown-tick': countdownTick,
  'countdown-go': countdownGo,
  'entered-band': enteredBand,
  'dropped-below': droppedBelow,
  'tut-target-reached': tutTargetReached,
  'hand-switch': handSwitch,
  'rest-ending': restEnding,
}
