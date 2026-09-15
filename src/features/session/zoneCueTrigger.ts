// Detects zone-crossing events during 'working' to drive the
// entered-band/dropped-below/tut-target-reached cues — see
// docs/04-screens-and-ux.md "Cues" and docs/07-architecture.md "Session
// state machine": the reducer deliberately does NOT track force thresholds
// within a target band (that's metrics-layer concern), so this lives in
// the effect layer, called once per live sample while 'working'.

import type { Band } from '../../core/metrics/band'
import { classifyZone, type Zone } from '../../core/metrics/zone'
import type { CueKind } from '../../services/cues/cueDefinitions'

export interface ZoneCueTriggerState {
  lastZone: Zone | null
  tutTargetReachedFired: boolean
}

export function createZoneCueTriggerState(): ZoneCueTriggerState {
  return { lastZone: null, tutTargetReachedFired: false }
}

export interface ZoneCueResult {
  state: ZoneCueTriggerState
  cue: CueKind | null
}

/**
 * Call once per live sample during 'working'. Returns at most one cue per
 * call — "entered-band" fires only on below->in or below->above
 * transitions (crossing UP into work), "dropped-below" fires only on
 * in/above->below (crossing DOWN out of work). Repeated samples within the
 * same zone fire nothing, so the cue plays once per crossing, not once per
 * sample.
 */
export function evaluateZoneCue(
  state: ZoneCueTriggerState,
  forceKg: number,
  band: Band,
): ZoneCueResult {
  const zone = classifyZone(forceKg, band)

  if (state.lastZone === null) {
    return { state: { ...state, lastZone: zone }, cue: null }
  }

  if (zone === state.lastZone) {
    return { state, cue: null }
  }

  const wasWorking = state.lastZone === 'in' || state.lastZone === 'above'
  const isWorking = zone === 'in' || zone === 'above'

  let cue: CueKind | null = null
  if (!wasWorking && isWorking) cue = 'entered-band'
  else if (wasWorking && !isWorking) cue = 'dropped-below'

  return { state: { ...state, lastZone: zone }, cue }
}

/**
 * Call once per live sample with the running TUT total vs. the set's
 * planned work duration. Fires 'tut-target-reached' exactly once per
 * effort, the moment TUT first meets the target — per docs/04 "success
 * tone + strong haptic — 'you can let go.'"
 */
export function evaluateTutTargetCue(
  state: ZoneCueTriggerState,
  timeUnderTensionMs: number,
  targetMs: number,
): ZoneCueResult {
  if (state.tutTargetReachedFired || timeUnderTensionMs < targetMs) {
    return { state, cue: null }
  }
  return { state: { ...state, tutTargetReachedFired: true }, cue: 'tut-target-reached' }
}
