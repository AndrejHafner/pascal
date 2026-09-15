import type { CuePlayer } from '../../../src/services/cues/CuePlayer'
import type { CueKind } from '../../../src/services/cues/cueDefinitions'

/** Records every cue played, for assertions — test-only. */
export function makeFakeCuePlayer(): CuePlayer & { played: CueKind[] } {
  const played: CueKind[] = []
  return {
    played,
    setMode: () => {},
    getMode: () => 'both',
    preload: async () => {},
    playCue: async (kind: CueKind) => {
      played.push(kind)
    },
  } as unknown as CuePlayer & { played: CueKind[] }
}
