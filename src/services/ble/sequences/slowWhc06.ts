import type { Sequence } from './types'
import { generatePoints } from './generate'

// Low-rate, single-sample-at-a-time — see docs/02-ble-protocol.md. Exercises
// the WH-C06 code path's lower fidelity specifically: WH-C06 has no
// batching (one sample per advertisement) and its real-world rate is an
// open question in docs/02, so this deliberately paces much slower than the
// Progressor-like sequences rather than assuming 60Hz.
const TARGET_KG = 25
const HOLD_MS = 6000
// ~4Hz placeholder pending the real measurement in docs/02 "Testing notes".
const INTERVAL_MS = 250

export const slowWhc06: Sequence = {
  id: 'slow-whc06',
  pacing: 'single',
  points: generatePoints(HOLD_MS, INTERVAL_MS, () => TARGET_KG),
}
