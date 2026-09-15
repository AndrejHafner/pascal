import {
  createZoneCueTriggerState,
  evaluateZoneCue,
  evaluateTutTargetCue,
} from '../../src/features/session/zoneCueTrigger'
import type { Band } from '../../src/core/metrics/band'

const band: Band = { targetKg: 30, toleranceKg: 5 } // [25, 35]

describe('evaluateZoneCue', () => {
  it('fires no cue on the very first sample (nothing to transition from)', () => {
    const result = evaluateZoneCue(createZoneCueTriggerState(), 30, band)
    expect(result.cue).toBeNull()
  })

  it('fires "entered-band" on below -> in', () => {
    let state = evaluateZoneCue(createZoneCueTriggerState(), 10, band).state
    const result = evaluateZoneCue(state, 28, band)
    expect(result.cue).toBe('entered-band')
  })

  it('fires "entered-band" on below -> above (skipping straight past the band)', () => {
    let state = evaluateZoneCue(createZoneCueTriggerState(), 10, band).state
    const result = evaluateZoneCue(state, 50, band)
    expect(result.cue).toBe('entered-band')
  })

  it('fires "dropped-below" on in -> below', () => {
    let state = evaluateZoneCue(createZoneCueTriggerState(), 30, band).state
    const result = evaluateZoneCue(state, 10, band)
    expect(result.cue).toBe('dropped-below')
  })

  it('fires "dropped-below" on above -> below', () => {
    let state = evaluateZoneCue(createZoneCueTriggerState(), 50, band).state
    const result = evaluateZoneCue(state, 10, band)
    expect(result.cue).toBe('dropped-below')
  })

  it('fires nothing on in -> above (still working, no crossing out of the working state)', () => {
    let state = evaluateZoneCue(createZoneCueTriggerState(), 30, band).state
    const result = evaluateZoneCue(state, 50, band)
    expect(result.cue).toBeNull()
  })

  it('fires nothing on above -> in (still working)', () => {
    let state = evaluateZoneCue(createZoneCueTriggerState(), 50, band).state
    const result = evaluateZoneCue(state, 30, band)
    expect(result.cue).toBeNull()
  })

  it('fires nothing while staying in the same zone across repeated samples', () => {
    let state = evaluateZoneCue(createZoneCueTriggerState(), 30, band).state
    state = evaluateZoneCue(state, 31, band).state
    const result = evaluateZoneCue(state, 29, band)
    expect(result.cue).toBeNull()
  })

  it('fires once per crossing, not once per sample in the new zone', () => {
    let state = evaluateZoneCue(createZoneCueTriggerState(), 10, band).state
    const first = evaluateZoneCue(state, 30, band)
    expect(first.cue).toBe('entered-band')

    const second = evaluateZoneCue(first.state, 31, band) // still in-band
    expect(second.cue).toBeNull()
  })
})

describe('evaluateTutTargetCue', () => {
  it('fires nothing while TUT is still below the target', () => {
    const state = createZoneCueTriggerState()
    const result = evaluateTutTargetCue(state, 3000, 5000)
    expect(result.cue).toBeNull()
  })

  it('fires "tut-target-reached" the moment TUT meets the target', () => {
    const state = createZoneCueTriggerState()
    const result = evaluateTutTargetCue(state, 5000, 5000)
    expect(result.cue).toBe('tut-target-reached')
  })

  it('fires only once — subsequent calls past the target fire nothing', () => {
    let state = createZoneCueTriggerState()
    const first = evaluateTutTargetCue(state, 5000, 5000)
    expect(first.cue).toBe('tut-target-reached')

    const second = evaluateTutTargetCue(first.state, 6000, 5000)
    expect(second.cue).toBeNull()
  })
})
