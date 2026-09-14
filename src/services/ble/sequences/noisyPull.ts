import type { Sequence } from './types'
import { generatePoints, makeRng } from './generate'

// Ramp-up, noisy plateau, ramp-down — see docs/02-ble-protocol.md. Exercises
// peak/mean/smoothing logic against realistic jitter rather than a clean
// signal, since the rolling-average max definition in docs/03 exists
// specifically because raw instantaneous readings are noisy.
const PEAK_KG = 35
const RAMP_UP_MS = 600
const PLATEAU_MS = 4000
const RAMP_DOWN_MS = 500
const NOISE_KG = 1.5

const rng = makeRng(42)

export const noisyPull: Sequence = {
  id: 'noisy-pull',
  pacing: 'batched',
  points: generatePoints(RAMP_UP_MS + PLATEAU_MS + RAMP_DOWN_MS, 16, (t) => {
    const noise = (rng() - 0.5) * 2 * NOISE_KG

    if (t < RAMP_UP_MS) {
      return PEAK_KG * (t / RAMP_UP_MS) + noise
    }
    if (t < RAMP_UP_MS + PLATEAU_MS) {
      return PEAK_KG + noise
    }
    const tDown = t - RAMP_UP_MS - PLATEAU_MS
    return PEAK_KG * (1 - tDown / RAMP_DOWN_MS) + noise
  }),
}
