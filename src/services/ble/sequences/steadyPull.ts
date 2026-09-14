import type { Sequence } from './types'
import { generatePoints } from './generate'

// "steady-hang" in docs/02-ble-protocol.md — renamed steady-pull in code to
// match docs/03's later "block pull, not hangs" terminology decision. Flat
// plateau around a target value: basic max-effort / time-in-band logic.
const TARGET_KG = 30
const RAMP_MS = 400
const HOLD_MS = 5000

export const steadyPull: Sequence = {
  id: 'steady-pull',
  pacing: 'batched',
  points: generatePoints(RAMP_MS + HOLD_MS, 16, (t) => {
    if (t < RAMP_MS) return TARGET_KG * (t / RAMP_MS)
    return TARGET_KG
  }),
}
