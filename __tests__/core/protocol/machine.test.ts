import { reduce, createInitialState } from '../../../src/core/protocol/machine'
import type { SetPlan, SessionState, SessionEvent } from '../../../src/core/protocol/machine'

const twoHandPlan: SetPlan = {
  setCount: 2,
  hands: ['left', 'right'],
  workDurationMs: 5000,
  countdownMs: 3000,
  interHandRestMs: 5000,
  interSetRestMs: 180_000,
  autoStartThresholdKg: 5,
}

function run(state: SessionState, events: SessionEvent[]): SessionState {
  let current = state
  for (const event of events) {
    current = reduce(current, event).state
  }
  return current
}

describe('session state machine — happy path through one full set', () => {
  it('START moves idle -> countdown', () => {
    const state = createInitialState(twoHandPlan)
    const result = reduce(state, { type: 'START' })
    expect(result.state.phase).toBe('countdown')
    expect(result.state.remainingMs).toBe(3000)
  })

  it('countdown TICKs down to zero, then transitions to armed', () => {
    let state = reduce(createInitialState(twoHandPlan), { type: 'START' }).state
    state = run(state, [
      { type: 'TICK', deltaMs: 1000 },
      { type: 'TICK', deltaMs: 1000 },
    ])
    expect(state.phase).toBe('countdown')
    expect(state.remainingMs).toBe(1000)

    state = reduce(state, { type: 'TICK', deltaMs: 1000 }).state
    expect(state.phase).toBe('armed')
  })

  it('armed -> working only once force crosses the auto-start threshold (docs/04)', () => {
    let state = run(createInitialState(twoHandPlan), [
      { type: 'START' },
      { type: 'TICK', deltaMs: 3000 },
    ])
    expect(state.phase).toBe('armed')

    const belowThreshold = reduce(state, { type: 'SAMPLE', forceKg: 2 })
    expect(belowThreshold.state.phase).toBe('armed')
    expect(belowThreshold.effects).toEqual([])

    const atThreshold = reduce(state, { type: 'SAMPLE', forceKg: 5 })
    expect(atThreshold.state.phase).toBe('working')
    expect(atThreshold.state.remainingMs).toBe(5000)
    expect(atThreshold.effects).toEqual([{ kind: 'persistEffortStart', hand: 'left' }])
  })

  it('working -> interHandRest when the work duration elapses and more hands remain', () => {
    let state = run(createInitialState(twoHandPlan), [
      { type: 'START' },
      { type: 'TICK', deltaMs: 3000 },
      { type: 'SAMPLE', forceKg: 10 },
    ])
    expect(state.phase).toBe('working')

    const result = reduce(state, { type: 'TICK', deltaMs: 5000 })
    expect(result.state.phase).toBe('interHandRest')
    expect(result.state.remainingMs).toBe(5000)
    expect(result.effects).toEqual([{ kind: 'persistEffortEnd', status: 'completed' }])
  })

  it('interHandRest -> countdown for the second hand, with a hand-switch cue', () => {
    let state = run(createInitialState(twoHandPlan), [
      { type: 'START' },
      { type: 'TICK', deltaMs: 3000 },
      { type: 'SAMPLE', forceKg: 10 },
      { type: 'TICK', deltaMs: 5000 }, // finish left hand -> interHandRest
    ])
    expect(state.handIndex).toBe(0)

    const result = reduce(state, { type: 'TICK', deltaMs: 5000 })
    expect(result.state.phase).toBe('countdown')
    expect(result.state.handIndex).toBe(1)
    expect(result.effects).toEqual([{ kind: 'playCue', cue: 'hand-switch' }])
  })

  it('the second hand auto-starts as "right", not "left" again', () => {
    let state = run(createInitialState(twoHandPlan), [
      { type: 'START' },
      { type: 'TICK', deltaMs: 3000 },
      { type: 'SAMPLE', forceKg: 10 }, // left hand starts
      { type: 'TICK', deltaMs: 5000 }, // left hand ends -> interHandRest
      { type: 'TICK', deltaMs: 5000 }, // -> countdown for right hand
      { type: 'TICK', deltaMs: 3000 }, // -> armed
    ])
    expect(state.phase).toBe('armed')
    expect(state.handIndex).toBe(1)

    const result = reduce(state, { type: 'SAMPLE', forceKg: 10 })
    expect(result.effects).toEqual([{ kind: 'persistEffortStart', hand: 'right' }])
  })

  it('working -> setRest (not interHandRest) when the LAST hand in the set finishes', () => {
    let state = run(createInitialState(twoHandPlan), [
      { type: 'START' },
      { type: 'TICK', deltaMs: 3000 },
      { type: 'SAMPLE', forceKg: 10 }, // left starts
      { type: 'TICK', deltaMs: 5000 }, // left ends
      { type: 'TICK', deltaMs: 5000 }, // -> countdown right
      { type: 'TICK', deltaMs: 3000 }, // -> armed right
      { type: 'SAMPLE', forceKg: 10 }, // right starts
    ])
    expect(state.phase).toBe('working')
    expect(state.handIndex).toBe(1)

    const result = reduce(state, { type: 'TICK', deltaMs: 5000 })
    expect(result.state.phase).toBe('setRest')
    expect(result.state.remainingMs).toBe(180_000)
  })

  it('setRest -> countdown for set 2, with handIndex reset to 0', () => {
    let state = runFullSet(twoHandPlan, 0)
    expect(state.phase).toBe('setRest')
    expect(state.setIndex).toBe(0)

    const result = reduce(state, { type: 'TICK', deltaMs: 180_000 })
    expect(result.state.phase).toBe('countdown')
    expect(result.state.setIndex).toBe(1)
    expect(result.state.handIndex).toBe(0)
  })

  it('setRest -> done after the LAST set finishes', () => {
    let state = runFullSet(twoHandPlan, 0)
    state = reduce(state, { type: 'TICK', deltaMs: 180_000 }).state // -> set 2 countdown
    state = runFullSet(twoHandPlan, 1, state)

    expect(state.phase).toBe('setRest')
    const result = reduce(state, { type: 'TICK', deltaMs: 180_000 })
    expect(result.state.phase).toBe('done')
  })
})

/**
 * Drives one full set (both hands), leaving the machine in 'setRest'.
 * `initial`, if given, must already be in 'countdown' for this set (as
 * TICKing setRest -> countdown leaves it) — the second parameter is unused
 * and kept only for call-site documentation of which set this drives.
 */
function runFullSet(plan: SetPlan, _setIndex: number, initial?: SessionState): SessionState {
  let state = initial ?? createInitialState(plan)
  if (state.phase === 'idle') state = reduce(state, { type: 'START' }).state

  for (let h = 0; h < plan.hands.length; h++) {
    // First hand starts in 'countdown' already; every subsequent hand
    // starts in 'interHandRest' and must pass through that rest first.
    if (state.phase === 'interHandRest') {
      state = reduce(state, { type: 'TICK', deltaMs: plan.interHandRestMs }).state // -> countdown
    }
    state = reduce(state, { type: 'TICK', deltaMs: plan.countdownMs }).state // countdown -> armed
    state = reduce(state, { type: 'SAMPLE', forceKg: 10 }).state // armed -> working
    state = reduce(state, { type: 'TICK', deltaMs: plan.workDurationMs }).state // working -> rest
  }
  return state
}

describe('session state machine — SKIP', () => {
  it('SKIP fast-forwards a countdown to armed', () => {
    let state = reduce(createInitialState(twoHandPlan), { type: 'START' }).state
    const result = reduce(state, { type: 'SKIP' })
    expect(result.state.phase).toBe('armed')
  })

  it('SKIP fast-forwards interHandRest straight to the next countdown', () => {
    let state = run(createInitialState(twoHandPlan), [
      { type: 'START' },
      { type: 'TICK', deltaMs: 3000 },
      { type: 'SAMPLE', forceKg: 10 },
      { type: 'TICK', deltaMs: 5000 }, // -> interHandRest
    ])
    const result = reduce(state, { type: 'SKIP' })
    expect(result.state.phase).toBe('countdown')
    expect(result.state.handIndex).toBe(1)
  })

  it('SKIP fast-forwards setRest to the next set', () => {
    let state = runFullSet(twoHandPlan, 0)
    const result = reduce(state, { type: 'SKIP' })
    expect(result.state.phase).toBe('countdown')
    expect(result.state.setIndex).toBe(1)
  })

  it('SKIP has no effect during working (not a specced control there, per docs/04)', () => {
    let state = run(createInitialState(twoHandPlan), [
      { type: 'START' },
      { type: 'TICK', deltaMs: 3000 },
      { type: 'SAMPLE', forceKg: 10 },
    ])
    expect(state.phase).toBe('working')
    const result = reduce(state, { type: 'SKIP' })
    expect(result.state.phase).toBe('working')
  })

  it('SKIP has no effect on idle or done', () => {
    const idle = createInitialState(twoHandPlan)
    expect(reduce(idle, { type: 'SKIP' }).state.phase).toBe('idle')
  })
})

describe('session state machine — DEVICE_LOST', () => {
  it('mid-working DEVICE_LOST interrupts and persists the effort as disconnected, not silently discarded', () => {
    let state = run(createInitialState(twoHandPlan), [
      { type: 'START' },
      { type: 'TICK', deltaMs: 3000 },
      { type: 'SAMPLE', forceKg: 10 },
    ])
    expect(state.phase).toBe('working')

    const result = reduce(state, { type: 'DEVICE_LOST' })
    expect(result.state.phase).toBe('interrupted')
    expect(result.state.interruptionReason).toBe('device_lost')
    expect(result.state.phaseBeforeInterruption).toBe('working')
    expect(result.effects).toEqual([{ kind: 'persistEffortEnd', status: 'disconnected' }])
  })

  it('DEVICE_LOST during rest interrupts without a persistEffortEnd (nothing was in flight)', () => {
    let state = run(createInitialState(twoHandPlan), [{ type: 'START' }])
    expect(state.phase).toBe('countdown')

    const result = reduce(state, { type: 'DEVICE_LOST' })
    expect(result.state.phase).toBe('interrupted')
    expect(result.effects).toEqual([])
  })

  it('DEVICE_LOST is a no-op when idle or done', () => {
    const idle = createInitialState(twoHandPlan)
    expect(reduce(idle, { type: 'DEVICE_LOST' }).state.phase).toBe('idle')
  })

  it('DEVICE_RESTORED after a mid-working loss returns to armed, never directly back to working', () => {
    let state = run(createInitialState(twoHandPlan), [
      { type: 'START' },
      { type: 'TICK', deltaMs: 3000 },
      { type: 'SAMPLE', forceKg: 10 },
      { type: 'DEVICE_LOST' },
    ])
    expect(state.phase).toBe('interrupted')

    const result = reduce(state, { type: 'DEVICE_RESTORED' })
    // Per docs/04: "never silently resume, since the gap corrupts TUT" —
    // the machine requires a fresh countdown/threshold-cross, not an
    // instant jump back into 'working'.
    expect(result.state.phase).toBe('armed')
    expect(result.state.interruptionReason).toBeNull()
  })

  it('DEVICE_RESTORED is a no-op if the interruption was not device_lost (e.g. user aborted)', () => {
    let state = run(createInitialState(twoHandPlan), [{ type: 'START' }, { type: 'ABORT' }])
    expect(state.interruptionReason).toBe('aborted')

    const result = reduce(state, { type: 'DEVICE_RESTORED' })
    expect(result.state.phase).toBe('interrupted') // unchanged
  })

  it('DEVICE_RESTORED is a no-op when not currently interrupted', () => {
    const state = createInitialState(twoHandPlan)
    expect(reduce(state, { type: 'DEVICE_RESTORED' }).state.phase).toBe('idle')
  })
})

describe('session state machine — ABORT', () => {
  it('ABORT mid-working persists the effort as aborted and interrupts', () => {
    let state = run(createInitialState(twoHandPlan), [
      { type: 'START' },
      { type: 'TICK', deltaMs: 3000 },
      { type: 'SAMPLE', forceKg: 10 },
    ])
    const result = reduce(state, { type: 'ABORT' })
    expect(result.state.phase).toBe('interrupted')
    expect(result.state.interruptionReason).toBe('aborted')
    expect(result.effects).toEqual([{ kind: 'persistEffortEnd', status: 'aborted' }])
  })

  it('ABORT is a no-op once done', () => {
    let state = runFullSet(twoHandPlan, 0)
    state = reduce(state, { type: 'TICK', deltaMs: 180_000 }).state
    state = runFullSet(twoHandPlan, 1, state)
    state = reduce(state, { type: 'TICK', deltaMs: 180_000 }).state
    expect(state.phase).toBe('done')

    const result = reduce(state, { type: 'ABORT' })
    expect(result.state.phase).toBe('done')
  })
})

describe('session state machine — BACKGROUNDED', () => {
  it('backgrounding mid-working interrupts and persists the effort (treated as an interruption, per docs/04)', () => {
    let state = run(createInitialState(twoHandPlan), [
      { type: 'START' },
      { type: 'TICK', deltaMs: 3000 },
      { type: 'SAMPLE', forceKg: 10 },
    ])
    const result = reduce(state, { type: 'BACKGROUNDED' })
    expect(result.state.phase).toBe('interrupted')
    expect(result.state.interruptionReason).toBe('backgrounded')
    expect(result.effects).toEqual([{ kind: 'persistEffortEnd', status: 'aborted' }])
  })
})

describe('session state machine — full headless session (docs/08 Phase 3 "done when")', () => {
  it('runs start-to-finish through every set and hand, ending in done', () => {
    let state = createInitialState(twoHandPlan)
    const allEffects: string[] = []

    function apply(event: SessionEvent) {
      const result = reduce(state, event)
      state = result.state
      allEffects.push(...result.effects.map((e) => e.kind))
    }

    apply({ type: 'START' })
    for (let setIndex = 0; setIndex < twoHandPlan.setCount; setIndex++) {
      for (let h = 0; h < twoHandPlan.hands.length; h++) {
        if (state.phase === 'interHandRest') {
          apply({ type: 'TICK', deltaMs: twoHandPlan.interHandRestMs })
        }
        apply({ type: 'TICK', deltaMs: twoHandPlan.countdownMs })
        apply({ type: 'SAMPLE', forceKg: 10 })
        apply({ type: 'TICK', deltaMs: twoHandPlan.workDurationMs })
      }
      apply({ type: 'TICK', deltaMs: twoHandPlan.interSetRestMs })
    }

    expect(state.phase).toBe('done')
    // 4 efforts total (2 sets x 2 hands) each with a start + end effect.
    expect(allEffects.filter((k) => k === 'persistEffortStart')).toHaveLength(4)
    expect(allEffects.filter((k) => k === 'persistEffortEnd')).toHaveLength(4)
  })
})

describe('session state machine — single-hand plan (docs/03 "single-handed work must be representable")', () => {
  const oneHandPlan: SetPlan = { ...twoHandPlan, hands: ['left'], setCount: 1 }

  it('a single-hand set goes straight from working to setRest, never interHandRest', () => {
    let state = run(createInitialState(oneHandPlan), [
      { type: 'START' },
      { type: 'TICK', deltaMs: 3000 },
      { type: 'SAMPLE', forceKg: 10 },
    ])
    const result = reduce(state, { type: 'TICK', deltaMs: 5000 })
    expect(result.state.phase).toBe('setRest')
  })
})
