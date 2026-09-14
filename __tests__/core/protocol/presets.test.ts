import {
  maxEffortDefault,
  targetBandDefault,
  repeaterDefault,
  repeaterHorstClassic,
} from '../../../src/core/protocol/presets'

describe('protocol presets', () => {
  it('maxEffortDefault matches docs/03 table (3s pull, 3 attempts, 90s rest)', () => {
    expect(maxEffortDefault).toEqual({
      kind: 'max_effort',
      pullDurationMs: 3000,
      attemptsPerHand: 3,
      restBetweenAttemptsMs: 90_000,
    })
  })

  it('targetBandDefault uses the 5s inter-hand rest and 3min inter-set rest from docs/03', () => {
    expect(targetBandDefault.interHandRestMs).toBe(5000)
    expect(targetBandDefault.interSetRestMs).toBe(180_000)
  })

  it('repeaterDefault matches Lattice anaerobic-capacity parameters (5 reps 7s/3s at 2.5min rest)', () => {
    expect(repeaterDefault.repCount).toBe(5)
    expect(repeaterDefault.repWorkMs).toBe(7000)
    expect(repeaterDefault.repRestMs).toBe(3000)
    expect(repeaterDefault.interSetRestMs).toBe(150_000)
  })

  it('repeaterHorstClassic uses 6 reps and a much longer circuit rest, distinct from Lattice', () => {
    expect(repeaterHorstClassic.repCount).toBe(6)
    expect(repeaterHorstClassic.interSetRestMs).toBeGreaterThan(repeaterDefault.interSetRestMs)
  })

  it('every preset carries a discriminant kind matching its type', () => {
    expect(maxEffortDefault.kind).toBe('max_effort')
    expect(targetBandDefault.kind).toBe('target_band')
    expect(repeaterDefault.kind).toBe('repeaters')
    expect(repeaterHorstClassic.kind).toBe('repeaters')
  })
})
