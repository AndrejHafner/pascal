import { CuePlayer } from '../../../src/services/cues/CuePlayer'
import type { HapticsAdapter } from '../../../src/services/cues/HapticsAdapter'

function makeFakeHaptics(): HapticsAdapter & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    impact: async (style) => {
      calls.push(`impact:${style}`)
    },
    notification: async (style) => {
      calls.push(`notification:${style}`)
    },
    selection: async () => {
      calls.push('selection')
    },
  }
}

describe('CuePlayer', () => {
  it('defaults to mode "both"', () => {
    const player = new CuePlayer(makeFakeHaptics())
    expect(player.getMode()).toBe('both')
  })

  it('plays haptics when mode is "haptic"', async () => {
    const haptics = makeFakeHaptics()
    const player = new CuePlayer(haptics)
    player.setMode('haptic')

    await player.playCue('entered-band')
    expect(haptics.calls.length).toBeGreaterThan(0)
  })

  it('plays haptics when mode is "both"', async () => {
    const haptics = makeFakeHaptics()
    const player = new CuePlayer(haptics)
    player.setMode('both')

    await player.playCue('entered-band')
    expect(haptics.calls.length).toBeGreaterThan(0)
  })

  it('does not call any haptic when mode is "sound"', async () => {
    const haptics = makeFakeHaptics()
    const player = new CuePlayer(haptics)
    player.setMode('sound')

    await player.playCue('entered-band')
    expect(haptics.calls).toEqual([])
  })

  it('does nothing at all when mode is "off"', async () => {
    const haptics = makeFakeHaptics()
    const player = new CuePlayer(haptics)
    player.setMode('off')

    await player.playCue('dropped-below')
    expect(haptics.calls).toEqual([])
  })

  it('"dropped-below" fires a distinct multi-step haptic pattern (per docs/04, the most important cue)', async () => {
    const haptics = makeFakeHaptics()
    const player = new CuePlayer(haptics)
    player.setMode('haptic')

    await player.playCue('dropped-below')
    expect(haptics.calls).toEqual(['impact:rigid', 'impact:rigid'])
  })

  it('"hand-switch" fires a double-pulse pattern distinct from any single-event cue', async () => {
    const haptics = makeFakeHaptics()
    const player = new CuePlayer(haptics)
    player.setMode('haptic')

    await player.playCue('hand-switch')
    expect(haptics.calls).toEqual(['impact:soft', 'impact:soft'])
  })

  it('"tut-target-reached" ends on a notification (the strongest positive built-in pattern)', async () => {
    const haptics = makeFakeHaptics()
    const player = new CuePlayer(haptics)
    player.setMode('haptic')

    await player.playCue('tut-target-reached')
    expect(haptics.calls[haptics.calls.length - 1]).toBe('notification:success')
  })

  it('"rest-ending" reuses the exact same pattern as "countdown-tick" (docs/04: "fewer distinct sounds to learn")', async () => {
    const haptics1 = makeFakeHaptics()
    const player1 = new CuePlayer(haptics1)
    player1.setMode('haptic')
    await player1.playCue('countdown-tick')

    const haptics2 = makeFakeHaptics()
    const player2 = new CuePlayer(haptics2)
    player2.setMode('haptic')
    await player2.playCue('rest-ending')

    expect(haptics2.calls).toEqual(haptics1.calls)
  })

  it('every cue kind has a haptic pattern distinguishable from "dropped-below" (the critical cue must never be confused)', async () => {
    const kinds = [
      'countdown-tick',
      'countdown-go',
      'entered-band',
      'tut-target-reached',
      'hand-switch',
      'rest-ending',
    ] as const

    const dropped = makeFakeHaptics()
    await new CuePlayer(dropped).playCue('dropped-below')

    for (const kind of kinds) {
      const haptics = makeFakeHaptics()
      const player = new CuePlayer(haptics)
      await player.playCue(kind)
      expect(haptics.calls).not.toEqual(dropped.calls)
    }
  })

  it('preload() resolves without throwing (no-op until real audio assets exist)', async () => {
    const player = new CuePlayer(makeFakeHaptics())
    await expect(player.preload()).resolves.toBeUndefined()
  })
})
