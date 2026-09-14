// Session state machine — a pure reducer, no timers, no I/O. See
// docs/07-architecture.md "Session state machine" and
// docs/04-screens-and-ux.md "Live session — the core screen".
//
// The effect layer (a hook in features/session/, Phase 4) owns the real
// timer, subscribes to the device, plays cues, and persists — it drives
// this reducer with events and translates declared `effects` into actual
// side effects. Keeping this pure means the whole flow — hand switching,
// rest timing, disconnect interruption — is testable by feeding canned
// event sequences, no hardware, no rendered UI.

import type { Hand } from '../types'

export type Phase =
  | 'idle'
  | 'countdown'
  | 'armed' // waiting for force threshold, per docs/07 "Auto-start"
  | 'working'
  | 'interHandRest'
  | 'setRest'
  | 'done'
  | 'interrupted'

export interface SetPlan {
  /** How many sets in this session. */
  setCount: number
  /** Which hands this set trains — usually both, per docs/03 "Bilateral". */
  hands: Hand[]
  workDurationMs: number
  countdownMs: number
  interHandRestMs: number
  interSetRestMs: number
  /** Force (kg) that arms->working auto-start triggers on. */
  autoStartThresholdKg: number
}

export interface SessionState {
  phase: Phase
  plan: SetPlan
  /** 0-indexed set number. */
  setIndex: number
  /** Index into plan.hands for the current/next hand within this set. */
  handIndex: number
  /** ms remaining in the current timed phase (countdown/rest), ticked down by TICK. */
  remainingMs: number
  /** Set when interrupted, so the effect layer knows what to tell the user. */
  interruptionReason: 'device_lost' | 'backgrounded' | 'aborted' | null
  /** Phase the machine was in when interrupted — needed to resume correctly. */
  phaseBeforeInterruption: Phase | null
}

export type SessionEvent =
  | { type: 'START' }
  | { type: 'TICK'; deltaMs: number }
  | { type: 'SAMPLE'; forceKg: number }
  | { type: 'SKIP' }
  | { type: 'ABORT' }
  | { type: 'DEVICE_LOST' }
  | { type: 'DEVICE_RESTORED' }
  | { type: 'BACKGROUNDED' }

export type SessionEffect =
  | {
      kind: 'playCue'
      cue: 'countdown-tick' | 'entered-band' | 'dropped-below' | 'hand-switch' | 'rest-ending'
    }
  | { kind: 'persistEffortEnd'; status: 'completed' | 'aborted' | 'disconnected' }
  | { kind: 'persistEffortStart'; hand: Hand }

export interface ReduceResult {
  state: SessionState
  effects: SessionEffect[]
}

export function createInitialState(plan: SetPlan): SessionState {
  return {
    phase: 'idle',
    plan,
    setIndex: 0,
    handIndex: 0,
    remainingMs: 0,
    interruptionReason: null,
    phaseBeforeInterruption: null,
  }
}

export function reduce(state: SessionState, event: SessionEvent): ReduceResult {
  switch (event.type) {
    case 'START':
      return handleStart(state)
    case 'TICK':
      return handleTick(state, event.deltaMs)
    case 'SAMPLE':
      return handleSample(state, event.forceKg)
    case 'SKIP':
      return handleSkip(state)
    case 'ABORT':
      return handleAbort(state)
    case 'DEVICE_LOST':
      return handleDeviceLost(state)
    case 'DEVICE_RESTORED':
      return handleDeviceRestored(state)
    case 'BACKGROUNDED':
      return handleBackgrounded(state)
  }
}

function handleStart(state: SessionState): ReduceResult {
  if (state.phase !== 'idle') return { state, effects: [] }
  return {
    state: { ...state, phase: 'countdown', remainingMs: state.plan.countdownMs },
    effects: [],
  }
}

const TIMED_PHASES: Phase[] = ['countdown', 'working', 'interHandRest', 'setRest']

function handleTick(state: SessionState, deltaMs: number): ReduceResult {
  if (!TIMED_PHASES.includes(state.phase)) {
    return { state, effects: [] }
  }

  const remainingMs = Math.max(0, state.remainingMs - deltaMs)
  if (remainingMs > 0) {
    return { state: { ...state, remainingMs }, effects: [] }
  }

  // Timer expired — advance to the next phase.
  switch (state.phase) {
    case 'countdown':
      return { state: { ...state, phase: 'armed', remainingMs: 0 }, effects: [] }

    case 'working':
      return finishWorking(state, 'completed')

    case 'interHandRest': {
      const nextHandIndex = state.handIndex + 1
      return {
        state: {
          ...state,
          phase: 'countdown',
          handIndex: nextHandIndex,
          remainingMs: state.plan.countdownMs,
        },
        effects: [{ kind: 'playCue', cue: 'hand-switch' }],
      }
    }

    case 'setRest': {
      const nextSetIndex = state.setIndex + 1
      if (nextSetIndex >= state.plan.setCount) {
        return { state: { ...state, phase: 'done', remainingMs: 0 }, effects: [] }
      }
      return {
        state: {
          ...state,
          phase: 'countdown',
          setIndex: nextSetIndex,
          handIndex: 0,
          remainingMs: state.plan.countdownMs,
        },
        effects: [],
      }
    }

    default:
      return { state, effects: [] }
  }
}

/**
 * Shared exit path from 'working', whether it ends naturally (TICK
 * exhausting remainingMs) or is fast-forwarded (SKIP). Routes to
 * interHandRest if there's another hand left in this set, otherwise
 * setRest — this is where the last-hand-in-set boundary is decided.
 */
function finishWorking(
  state: SessionState,
  status: 'completed' | 'aborted' | 'disconnected',
): ReduceResult {
  const effects: SessionEffect[] = [{ kind: 'persistEffortEnd', status }]
  const isLastHand = state.handIndex + 1 >= state.plan.hands.length

  if (isLastHand) {
    return {
      state: { ...state, phase: 'setRest', remainingMs: state.plan.interSetRestMs },
      effects,
    }
  }

  return {
    state: { ...state, phase: 'interHandRest', remainingMs: state.plan.interHandRestMs },
    effects,
  }
}

function handleSample(state: SessionState, forceKg: number): ReduceResult {
  if (state.phase === 'armed') {
    if (forceKg >= state.plan.autoStartThresholdKg) {
      return {
        state: { ...state, phase: 'working', remainingMs: state.plan.workDurationMs },
        effects: [{ kind: 'persistEffortStart', hand: currentHand(state) }],
      }
    }
    return { state, effects: [] }
  }

  // While 'working', SAMPLE events don't drive phase transitions — that's
  // TICK's job (work duration elapsing, per finishWorking). The band/zone
  // cue logic (entered-band / dropped-below) lives with the metrics layer's
  // band evaluation in the effect layer, not the machine: this reducer only
  // tracks phase/timing, not force thresholds within a target band.
  return { state, effects: [] }
}

function handleSkip(state: SessionState): ReduceResult {
  // SKIP fast-forwards whatever timed phase is active — used for "skip
  // rest" (docs/04 "set rest ... a skip control") and equally applicable
  // to skipping a countdown or inter-hand rest.
  if (state.phase === 'countdown' || state.phase === 'interHandRest' || state.phase === 'setRest') {
    return handleTick(state, state.remainingMs)
  }
  return { state, effects: [] }
}

function handleAbort(state: SessionState): ReduceResult {
  if (state.phase === 'done' || state.phase === 'idle') return { state, effects: [] }

  const effects: SessionEffect[] = []
  if (state.phase === 'working') {
    effects.push({ kind: 'persistEffortEnd', status: 'aborted' })
  }

  return {
    state: {
      ...state,
      phase: 'interrupted',
      interruptionReason: 'aborted',
      phaseBeforeInterruption: state.phase,
    },
    effects,
  }
}

function handleDeviceLost(state: SessionState): ReduceResult {
  // Only meaningful mid-effort — if we're resting or between phases, a
  // disconnect doesn't corrupt anything yet, but per docs/02's "surface it
  // to the user immediately," any phase gets interrupted so the UI can
  // show the disconnected state and the user decides how to proceed.
  if (state.phase === 'done' || state.phase === 'idle' || state.phase === 'interrupted') {
    return { state, effects: [] }
  }

  const effects: SessionEffect[] = []
  if (state.phase === 'working') {
    effects.push({ kind: 'persistEffortEnd', status: 'disconnected' })
  }

  return {
    state: {
      ...state,
      phase: 'interrupted',
      interruptionReason: 'device_lost',
      phaseBeforeInterruption: state.phase,
    },
    effects,
  }
}

function handleDeviceRestored(state: SessionState): ReduceResult {
  if (state.phase !== 'interrupted' || state.interruptionReason !== 'device_lost') {
    return { state, effects: [] }
  }

  // Per docs/04 "never silently resume, since the gap corrupts TUT" — the
  // machine does not auto-resume into 'working'. It returns to 'armed' for
  // the current hand, requiring a fresh countdown/threshold-cross, and the
  // effect layer is responsible for offering "resume set" vs "discard and
  // redo" as an explicit user choice before ever re-entering this state.
  return {
    state: {
      ...state,
      phase: 'armed',
      interruptionReason: null,
      phaseBeforeInterruption: null,
    },
    effects: [],
  }
}

function handleBackgrounded(state: SessionState): ReduceResult {
  if (state.phase === 'done' || state.phase === 'idle' || state.phase === 'interrupted') {
    return { state, effects: [] }
  }

  const effects: SessionEffect[] = []
  if (state.phase === 'working') {
    effects.push({ kind: 'persistEffortEnd', status: 'aborted' })
  }

  return {
    state: {
      ...state,
      phase: 'interrupted',
      interruptionReason: 'backgrounded',
      phaseBeforeInterruption: state.phase,
    },
    effects,
  }
}

function currentHand(state: SessionState): Hand {
  return state.plan.hands[state.handIndex % state.plan.hands.length]
}
