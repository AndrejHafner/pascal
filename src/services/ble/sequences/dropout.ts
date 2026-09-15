import type { Sequence } from './types'
import { generatePoints } from './generate'

// Stops emitting mid-stream — see docs/02-ble-protocol.md. Simulates a
// mid-session BLE disconnect so reconnect/error-state UI (frozen chart,
// paused TUT clock — see docs/04-screens-and-ux.md) can be exercised
// without physically walking out of range. EmulatorDevice is responsible
// for firing onStatus('disconnected') once these points are exhausted.
const TARGET_KG = 28
const RAMP_MS = 300
const RUNS_MS = 2500

export const dropout: Sequence = {
  id: 'dropout',
  pacing: 'batched',
  loop: false,
  points: generatePoints(RAMP_MS + RUNS_MS, 16, (t) => {
    if (t < RAMP_MS) return TARGET_KG * (t / RAMP_MS)
    return TARGET_KG
  }),
}
