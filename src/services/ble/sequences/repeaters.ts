import type { Sequence } from './types'
import { generatePoints } from './generate'

// Classic 7s on / 3s off x 6 reps — see docs/03-training-and-data-model.md
// "Repeaters". Exercises rep-counting / on-off cycling logic.
const WORK_KG = 22
const REST_KG = 0
const WORK_MS = 7000
const REST_MS = 3000
const REPS = 6
const RAMP_MS = 150

export const repeaters: Sequence = {
  id: 'repeaters',
  pacing: 'batched',
  points: generatePoints(REPS * (WORK_MS + REST_MS), 16, (t) => {
    const cycleMs = WORK_MS + REST_MS
    const withinCycle = t % cycleMs
    if (withinCycle < RAMP_MS) return WORK_KG * (withinCycle / RAMP_MS)
    if (withinCycle < WORK_MS) return WORK_KG
    return REST_KG
  }),
}
