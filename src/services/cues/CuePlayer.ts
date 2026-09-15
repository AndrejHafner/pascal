import { cueDefinitions } from './cueDefinitions'
import type { CueKind, CueDefinition } from './cueDefinitions'
import type { HapticsAdapter } from './HapticsAdapter'

export type CueMode = 'sound' | 'haptic' | 'both' | 'off'

/**
 * Wraps tones + haptics behind one playCue(kind) call — see
 * docs/07-architecture.md "Cues". Tones are meant to be preloaded at
 * session start so playback never blows the <50ms threshold-to-cue budget
 * (docs/06); the actual audio asset wiring is a documented follow-up (see
 * cueDefinitions.ts — no audio files exist yet), so today this class's
 * "preload" step only concerns whatever tone loading is added later. The
 * haptic path is fully real now, per docs/04's "haptic-only must be a
 * fully functional mode."
 */
export class CuePlayer {
  private mode: CueMode = 'both'

  constructor(private readonly haptics: HapticsAdapter) {}

  setMode(mode: CueMode): void {
    this.mode = mode
  }

  getMode(): CueMode {
    return this.mode
  }

  /** No-op today — reserved for real tone asset preloading once audio files exist. */
  async preload(): Promise<void> {
    // Intentionally empty. See cueDefinitions.ts.
  }

  async playCue(kind: CueKind): Promise<void> {
    if (this.mode === 'off') return

    const definition = cueDefinitions[kind]

    const playHaptic = this.mode === 'haptic' || this.mode === 'both'
    const playSound = this.mode === 'sound' || this.mode === 'both'

    if (playSound) {
      this.playTone(definition)
    }
    if (playHaptic) {
      await this.playHapticSteps(definition)
    }
  }

  private playTone(definition: CueDefinition): void {
    // No-op until real audio assets exist — see cueDefinitions.ts. Kept as
    // an explicit branch (rather than folding into playCue) so the seam
    // for wiring in expo-audio playback later is obvious and isolated.
    void definition.toneAsset
  }

  private async playHapticSteps(definition: CueDefinition): Promise<void> {
    for (const step of definition.haptics) {
      switch (step.kind) {
        case 'impact':
          await this.haptics.impact(step.style)
          break
        case 'notification':
          await this.haptics.notification(step.style)
          break
        case 'selection':
          await this.haptics.selection()
          break
        case 'wait':
          await sleep(step.ms)
          break
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
